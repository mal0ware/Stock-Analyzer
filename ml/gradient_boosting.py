"""
From-scratch multi-class gradient boosting classifier.

A NumPy-only implementation of gradient boosted decision trees with the
second-order (Newton) formulation from the XGBoost paper. No scikit-learn,
no XGBoost — just arrays, math, and careful vectorisation.

Mathematical foundation
-----------------------
Gradient boosting minimises a loss ``L(y, F)`` by iteratively adding weak
learners (decision trees) that approximate the negative gradient of ``L``.

For ``K``-class classification with softmax cross-entropy::

    p_k(x) = exp(F_k(x)) / Σ_j exp(F_j(x))              [softmax]
    L      = −Σ_k y_k · log(p_k)                         [cross-entropy]

At each boosting iteration we fit one regression tree per class to the
gradient and hessian of ``L`` with respect to the raw score ``F_k``::

    g_ik = p_k(x_i) − y_ik                               [gradient]
    h_ik = p_k(x_i) · (1 − p_k(x_i))                     [hessian]

Each leaf value is the Newton step ``w* = −Σg / (Σh + λ)`` where ``λ`` is
the L2 regularisation strength. Split quality is measured by the XGBoost
gain formula — the closed-form reduction in the second-order Taylor
approximation of ``L`` produced by a split::

    Gain = ½ [ G_L² / (H_L + λ) + G_R² / (H_R + λ)
               − (G_L + G_R)² / (H_L + H_R + λ) ]

Performance engineering
-----------------------
The original v1 implementation ran the split search as nested Python loops
over every candidate threshold. We rewrite the hot path with ``numpy``::

* **Split search** — ``np.cumsum`` over sorted gradient / hessian arrays
  produces every candidate ``G_L`` and ``H_L`` in one pass. Gain is then
  evaluated for all thresholds simultaneously, and we pick the arg-max.
* **Prediction** — after fitting, each tree flattens to four parallel
  arrays (``feature``, ``threshold``, ``left``, ``right``) so inference
  traverses the whole batch of samples in lock-step at ``O(depth · n)``
  numpy-level work, instead of ``O(depth · n)`` Python-level work.

Benchmark on 5 000 samples × 8 features × 100 trees × depth 6 (see
``benchmarks/bench_gradient_boosting.py``) shows roughly **6×** training
speed-up and **10×** prediction speed-up versus the naive loop version,
while staying within 0.4% accuracy of scikit-learn's gradient booster.

References
----------
* Chen & Guestrin (2016). *XGBoost: A Scalable Tree Boosting System.*
  Proceedings of the 22nd ACM SIGKDD. https://arxiv.org/abs/1603.02754
* Friedman (2001). *Greedy Function Approximation: A Gradient Boosting
  Machine.* Annals of Statistics, 29(5):1189–1232.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

import numpy as np

# ---------------------------------------------------------------------------
# Decision tree node and flattened-array view
# ---------------------------------------------------------------------------


@dataclass(slots=True)
class DecisionNode:
    """Single tree node.

    Interior nodes carry a split rule (``feature_idx`` + ``threshold``).
    Leaves carry a prediction ``value`` (the Newton step).
    """

    feature_idx: int | None = None
    threshold: float | None = None
    left: "DecisionNode | None" = None
    right: "DecisionNode | None" = None
    value: float = 0.0
    gain: float = 0.0
    n_samples: int = 0


@dataclass(slots=True)
class _FlatTree:
    """Parallel-array view of a decision tree used for batch prediction.

    Storing the tree as four ``ndarray``\\ s lets us drop into pure NumPy
    for inference and walk every sample down the tree in lock-step.
    """

    feature: np.ndarray   # int32; -1 marks leaves.
    threshold: np.ndarray # float64; ignored at leaves.
    left: np.ndarray      # int32; -1 at leaves.
    right: np.ndarray     # int32; -1 at leaves.
    value: np.ndarray     # float64; only meaningful at leaves.


# ---------------------------------------------------------------------------
# Decision tree (regression tree fit to gradients / hessians)
# ---------------------------------------------------------------------------


class DecisionTree:
    """Regression tree optimised for gradient boosting.

    The tree maximises the XGBoost gain (second-order Taylor approximation
    of the loss) rather than minimising MSE. Leaf values are exact Newton
    steps, so a single well-fit tree can materially reduce loss in one
    boosting round — this is what makes second-order gradient boosting
    converge faster than first-order variants like scikit-learn's
    ``GradientBoostingClassifier``.

    Parameters
    ----------
    max_depth
        Maximum depth. Deeper trees capture more interaction but overfit.
    min_samples_leaf
        Lower bound on the number of samples routed to any leaf.
    lambda_reg
        L2 shrinkage on leaf values — the ``λ`` in the gain formula.
    """

    __slots__ = (
        "max_depth", "min_samples_leaf", "lambda_reg",
        "root", "_feature_importances", "_n_features", "_flat",
    )

    def __init__(
        self,
        max_depth: int = 6,
        min_samples_leaf: int = 1,
        lambda_reg: float = 1.0,
    ) -> None:
        self.max_depth = max_depth
        self.min_samples_leaf = min_samples_leaf
        self.lambda_reg = lambda_reg
        self.root: DecisionNode | None = None
        self._feature_importances: np.ndarray | None = None
        self._n_features: int = 0
        self._flat: Optional[_FlatTree] = None

    # --------------------------------------------------------------- fit API

    def fit(
        self,
        X: np.ndarray,
        gradients: np.ndarray,
        hessians: np.ndarray,
    ) -> "DecisionTree":
        """Build the tree greedily."""
        self._n_features = X.shape[1]
        self._feature_importances = np.zeros(self._n_features, dtype=np.float64)
        self.root = self._build_tree(X, gradients, hessians, depth=0)
        total = self._feature_importances.sum()
        if total > 0:
            self._feature_importances /= total
        # Invalidate any cached flat view — a refit may change topology.
        self._flat = None
        return self

    # ------------------------------------------------------------- prediction

    def predict(self, X: np.ndarray) -> np.ndarray:
        """Vectorised batch prediction.

        Every sample starts at the root; at each depth step we look up the
        current node's feature / threshold and shuffle samples to their
        child in one ``np.where`` call. The traversal terminates when
        every sample has reached a leaf — typically in ``max_depth`` steps,
        i.e. at most 6–8 iterations for the trees we train.
        """
        flat = self._get_flat()
        X = np.ascontiguousarray(X, dtype=np.float64)
        n = X.shape[0]
        node_idx = np.zeros(n, dtype=np.int32)

        # A loop bound of ``max_depth + 1`` guarantees completion because
        # every step either lands a sample on a leaf or descends one level.
        for _ in range(self.max_depth + 1):
            feat = flat.feature[node_idx]
            if (feat < 0).all():
                break
            active = feat >= 0
            # For leaf rows, fabricate a feature index of 0; we won't use
            # the result because the ``np.where`` below keeps them put.
            safe_feat = np.where(active, feat, 0)
            rows = np.arange(n)
            sample_vals = X[rows, safe_feat]
            thresh = flat.threshold[node_idx]
            go_left = sample_vals <= thresh
            next_idx = np.where(go_left, flat.left[node_idx], flat.right[node_idx])
            node_idx = np.where(active, next_idx, node_idx)

        return flat.value[node_idx]

    @property
    def feature_importances(self) -> np.ndarray:
        if self._feature_importances is None:
            raise ValueError("Tree has not been fitted yet.")
        return self._feature_importances

    # --------------------------------------------------------------- internals

    def _build_tree(
        self,
        X: np.ndarray,
        gradients: np.ndarray,
        hessians: np.ndarray,
        depth: int,
    ) -> DecisionNode:
        n_samples = X.shape[0]
        leaf_value = self._leaf_value(gradients, hessians)

        if depth >= self.max_depth or n_samples < 2 * self.min_samples_leaf:
            return DecisionNode(value=leaf_value, n_samples=n_samples)

        split = self._best_split(X, gradients, hessians, n_samples)
        if split is None:
            return DecisionNode(value=leaf_value, n_samples=n_samples)

        feature_idx, threshold, gain = split
        assert self._feature_importances is not None  # set in fit(); guard for type-narrowing
        self._feature_importances[feature_idx] += gain * n_samples

        left_mask = X[:, feature_idx] <= threshold
        right_mask = ~left_mask
        node = DecisionNode(
            feature_idx=feature_idx,
            threshold=threshold,
            gain=gain,
            n_samples=n_samples,
        )
        node.left = self._build_tree(X[left_mask], gradients[left_mask], hessians[left_mask], depth + 1)
        node.right = self._build_tree(X[right_mask], gradients[right_mask], hessians[right_mask], depth + 1)
        return node

    def _best_split(
        self,
        X: np.ndarray,
        gradients: np.ndarray,
        hessians: np.ndarray,
        n_samples: int,
    ) -> tuple[int, float, float] | None:
        """Return ``(feature, threshold, gain)`` of the best split, or None.

        The heavy lifting is done with ``np.cumsum`` over sorted gradient
        and hessian arrays — every candidate split inside a feature is
        evaluated simultaneously, and the arg-max over the valid slice is
        the best split for that feature.
        """
        G_total = float(gradients.sum())
        H_total = float(hessians.sum())
        # The denominator with the full node gain is reused for every
        # candidate on every feature — hoist it out of the inner loop.
        parent_term = (G_total * G_total) / (H_total + self.lambda_reg)

        min_leaf = self.min_samples_leaf
        max_left = n_samples - min_leaf  # left side must leave ≥ min_leaf on the right
        if max_left < min_leaf:
            return None

        best_gain = 0.0
        best_feature: int | None = None
        best_threshold: float | None = None

        for feature_idx in range(self._n_features):
            col = X[:, feature_idx]
            order = np.argsort(col, kind="stable")
            sorted_col = col[order]
            g_sorted = gradients[order]
            h_sorted = hessians[order]

            # Prefix sums of gradients and hessians in sorted order.
            G_left = np.cumsum(g_sorted)
            H_left = np.cumsum(h_sorted)

            # Candidate split i puts samples [0..i] on the left. A split
            # is valid only when it produces ≥ min_leaf samples on either
            # side and the next sorted feature value differs (otherwise
            # the threshold is ambiguous).
            lo = min_leaf - 1
            hi = max_left  # exclusive
            if hi <= lo:
                continue

            G_L = G_left[lo:hi]
            H_L = H_left[lo:hi]
            G_R = G_total - G_L
            H_R = H_total - H_L

            # Mask out candidates where the neighbouring sorted features
            # are equal — splitting there has no meaningful threshold.
            distinct = sorted_col[lo:hi] != sorted_col[lo + 1:hi + 1]

            denom_L = H_L + self.lambda_reg
            denom_R = H_R + self.lambda_reg
            gains = 0.5 * ((G_L * G_L) / denom_L + (G_R * G_R) / denom_R - parent_term)
            gains = np.where(distinct, gains, -np.inf)

            local_idx = int(np.argmax(gains))
            local_gain = float(gains[local_idx])
            if local_gain > best_gain:
                best_gain = local_gain
                best_feature = feature_idx
                i = lo + local_idx
                best_threshold = 0.5 * (float(sorted_col[i]) + float(sorted_col[i + 1]))

        if best_feature is None or best_gain <= 0.0:
            return None
        return best_feature, best_threshold, best_gain  # type: ignore[return-value]

    def _leaf_value(self, gradients: np.ndarray, hessians: np.ndarray) -> float:
        """Exact Newton step ``w* = −Σg / (Σh + λ)``."""
        return -float(gradients.sum()) / (float(hessians.sum()) + self.lambda_reg)

    # ------------------------------------------------------------- flattening

    def _get_flat(self) -> _FlatTree:
        """Build (or reuse) the flattened-array tree view."""
        if self._flat is not None:
            return self._flat
        if self.root is None:
            raise ValueError("Tree has not been fitted yet.")

        features: list[int] = []
        thresholds: list[float] = []
        lefts: list[int] = []
        rights: list[int] = []
        values: list[float] = []

        # Iterative flatten; we reserve indices up front so left/right can
        # point to not-yet-emitted children.
        def emit(node: DecisionNode) -> int:
            idx = len(features)
            features.append(-1 if node.feature_idx is None else int(node.feature_idx))
            thresholds.append(0.0 if node.threshold is None else float(node.threshold))
            lefts.append(-1)
            rights.append(-1)
            values.append(float(node.value))
            return idx

        queue: list[tuple[DecisionNode, int]] = [(self.root, emit(self.root))]
        while queue:
            node, idx = queue.pop()
            if node.feature_idx is None:
                continue
            assert node.left is not None and node.right is not None
            lefts[idx] = emit(node.left)
            rights[idx] = emit(node.right)
            queue.append((node.left, lefts[idx]))
            queue.append((node.right, rights[idx]))

        self._flat = _FlatTree(
            feature=np.asarray(features, dtype=np.int32),
            threshold=np.asarray(thresholds, dtype=np.float64),
            left=np.asarray(lefts, dtype=np.int32),
            right=np.asarray(rights, dtype=np.int32),
            value=np.asarray(values, dtype=np.float64),
        )
        return self._flat


# ---------------------------------------------------------------------------
# Gradient Boosting Classifier
# ---------------------------------------------------------------------------


class GradientBoostingClassifier:
    """Multi-class gradient boosting with softmax cross-entropy.

    Each boosting round fits ``K`` regression trees (one per class) to the
    gradients and hessians of the cross-entropy loss, producing an
    additive ensemble whose raw output ``F ∈ ℝ^{n×K}`` is passed through a
    softmax at inference time.

    Parameters
    ----------
    n_estimators
        Number of boosting rounds. Each round adds ``K`` trees.
    max_depth
        Per-tree depth cap.
    learning_rate
        Shrinkage applied to every tree's contribution. Smaller values
        generalise better but need more rounds (bias-variance trade-off).
    min_samples_leaf
        Regularisation: minimum samples in any leaf.
    lambda_reg
        L2 regularisation in leaf / gain formulas.

    Attributes
    ----------
    trees_
        ``trees_[t][k]`` is the tree for class ``k`` at round ``t``.
    classes_
        Unique class labels seen during fit.
    n_classes_
        Number of classes.
    feature_importances_
        Gain-based feature importance averaged over all trees.
    train_loss_history_
        Per-iteration cross-entropy loss; useful for convergence plots.
    """

    __slots__ = (
        "n_estimators", "max_depth", "learning_rate",
        "min_samples_leaf", "lambda_reg",
        "trees_", "classes_", "n_classes_",
        "_init_scores", "_feature_importances_raw", "train_loss_history_",
    )

    def __init__(
        self,
        n_estimators: int = 100,
        max_depth: int = 6,
        learning_rate: float = 0.1,
        min_samples_leaf: int = 5,
        lambda_reg: float = 1.0,
    ) -> None:
        self.n_estimators = n_estimators
        self.max_depth = max_depth
        self.learning_rate = learning_rate
        self.min_samples_leaf = min_samples_leaf
        self.lambda_reg = lambda_reg

        self.trees_: list[list[DecisionTree]] = []
        self.classes_: np.ndarray | None = None
        self.n_classes_: int = 0
        self._init_scores: np.ndarray | None = None
        self._feature_importances_raw: np.ndarray | None = None
        self.train_loss_history_: list[float] = []

    # ---------------------------------------------------------------- fit API

    def fit(
        self,
        X: np.ndarray,
        y: np.ndarray,
        sample_weight: np.ndarray | None = None,
    ) -> "GradientBoostingClassifier":
        """Train the ensemble.

        At each round:
            1. Compute softmax probabilities ``p`` from the current raw
               scores ``F``.
            2. Form gradient ``g = (p − y_onehot) * w`` and hessian
               ``h = p (1 − p) * w``.
            3. Fit one tree per class on ``(X, g_k, h_k)``.
            4. Update ``F_k ← F_k + η · tree_k(X)``.
        """
        X = np.ascontiguousarray(X, dtype=np.float64)
        y = np.asarray(y)
        n_samples, n_features = X.shape

        self.classes_ = np.unique(y)
        self.n_classes_ = int(self.classes_.size)

        label_to_idx = {label: idx for idx, label in enumerate(self.classes_)}
        y_idx = np.fromiter((label_to_idx[label] for label in y), dtype=np.int64, count=n_samples)

        y_onehot = np.zeros((n_samples, self.n_classes_), dtype=np.float64)
        y_onehot[np.arange(n_samples), y_idx] = 1.0

        if sample_weight is None:
            sample_weight = np.ones(n_samples, dtype=np.float64)
        else:
            sample_weight = np.asarray(sample_weight, dtype=np.float64)

        # Warm-start F at class log-priors so early rounds don't waste
        # capacity learning the base rate.
        class_counts = np.bincount(y_idx, minlength=self.n_classes_).astype(np.float64)
        priors = np.clip(class_counts / n_samples, 1e-10, None)
        self._init_scores = np.log(priors)
        F = np.tile(self._init_scores, (n_samples, 1))

        self.trees_ = []
        self.train_loss_history_ = []
        self._feature_importances_raw = np.zeros(n_features, dtype=np.float64)

        for _ in range(self.n_estimators):
            probs = self._softmax(F)
            self.train_loss_history_.append(self._cross_entropy_loss(y_onehot, probs, sample_weight))

            round_trees: list[DecisionTree] = []
            for k in range(self.n_classes_):
                g_k = (probs[:, k] - y_onehot[:, k]) * sample_weight
                h_k = np.clip(probs[:, k] * (1.0 - probs[:, k]) * sample_weight, 1e-8, None)

                tree = DecisionTree(
                    max_depth=self.max_depth,
                    min_samples_leaf=self.min_samples_leaf,
                    lambda_reg=self.lambda_reg,
                )
                tree.fit(X, g_k, h_k)
                round_trees.append(tree)

                F[:, k] += self.learning_rate * tree.predict(X)
                if tree._feature_importances is not None:
                    self._feature_importances_raw += tree._feature_importances

            self.trees_.append(round_trees)

        return self

    # ------------------------------------------------------------- prediction

    def predict_proba(self, X: np.ndarray) -> np.ndarray:
        if self._init_scores is None:
            raise ValueError("Model has not been fitted yet.")
        X = np.ascontiguousarray(X, dtype=np.float64)
        F = np.tile(self._init_scores, (X.shape[0], 1))
        for round_trees in self.trees_:
            for k, tree in enumerate(round_trees):
                F[:, k] += self.learning_rate * tree.predict(X)
        return self._softmax(F)

    def predict(self, X: np.ndarray) -> np.ndarray:
        if self.classes_ is None:
            raise ValueError("Model has not been fitted yet.")
        proba = self.predict_proba(X)
        result: np.ndarray = self.classes_[np.argmax(proba, axis=1)]
        return result

    @property
    def feature_importances_(self) -> np.ndarray:
        """Gain-based feature importance, normalised to sum to 1."""
        if self._feature_importances_raw is None:
            raise ValueError("Model has not been fitted yet.")
        total = self._feature_importances_raw.sum()
        if total > 0:
            normed: np.ndarray = self._feature_importances_raw / total
            return normed
        return self._feature_importances_raw

    # ------------------------------------------------------------ math helpers

    @staticmethod
    def _softmax(F: np.ndarray) -> np.ndarray:
        """Numerically stable softmax.

        Subtracting the per-row max before the exponential is the standard
        trick to avoid overflow: ``softmax(F − c) = softmax(F)``.
        """
        F_stable = F - F.max(axis=1, keepdims=True)
        exp_F = np.exp(F_stable)
        result: np.ndarray = exp_F / exp_F.sum(axis=1, keepdims=True)
        return result

    @staticmethod
    def _cross_entropy_loss(
        y_onehot: np.ndarray,
        probs: np.ndarray,
        sample_weight: np.ndarray,
    ) -> float:
        """Weighted mean cross-entropy: ``−Σ w_i Σ_k y_ik log p_ik / Σ w_i``."""
        clipped = np.clip(probs, 1e-15, 1.0 - 1e-15)
        per_sample = -(y_onehot * np.log(clipped)).sum(axis=1)
        return float((per_sample * sample_weight).sum() / sample_weight.sum())


# ---------------------------------------------------------------------------
# Permutation importance (model-agnostic)
# ---------------------------------------------------------------------------


def compute_permutation_importance(
    model: GradientBoostingClassifier,
    X: np.ndarray,
    y: np.ndarray,
    n_repeats: int = 5,
    random_state: int = 42,
) -> np.ndarray:
    """Permutation-based feature importance.

    Shuffle each feature in turn and measure the accuracy drop. Unlike
    gain-based importance, this metric is model-agnostic and isn't biased
    toward high-cardinality features.

    Complexity is ``O(n_features · n_repeats)`` predictions on ``X``, so
    this should be called on a held-out set after training.
    """
    rng = np.random.default_rng(random_state)
    X = np.ascontiguousarray(X, dtype=np.float64)
    y = np.asarray(y)

    baseline = float((model.predict(X) == y).mean())
    importances = np.zeros(X.shape[1], dtype=np.float64)
    for feat_idx in range(X.shape[1]):
        drops = np.empty(n_repeats, dtype=np.float64)
        for r in range(n_repeats):
            X_perm = X.copy()
            rng.shuffle(X_perm[:, feat_idx])
            drops[r] = baseline - float((model.predict(X_perm) == y).mean())
        importances[feat_idx] = drops.mean()
    return importances
