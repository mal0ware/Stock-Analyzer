package analyzer;

import java.io.*;
import java.util.*;

/**
 * Generates plain-English interpretations of stock data.
 * Receives JSON via stdin, outputs interpretation JSON to stdout.
 */
public class Interpreter {

    public static void main(String[] args) {
        try {
            // Read JSON input from stdin
            StringBuilder input = new StringBuilder();
            BufferedReader reader = new BufferedReader(new InputStreamReader(System.in));
            String line;
            while ((line = reader.readLine()) != null) {
                input.append(line);
            }

            String json = input.toString();
            Map<String, Object> data = parseSimpleJson(json);

            List<String> insights = generateInsights(data);

            // Output as JSON
            StringBuilder output = new StringBuilder();
            output.append("{\"insights\":[");
            for (int i = 0; i < insights.size(); i++) {
                if (i > 0) output.append(",");
                output.append("\"").append(escapeJson(insights.get(i))).append("\"");
            }
            output.append("]}");

            System.out.println(output.toString());

        } catch (Exception e) {
            System.out.println("{\"insights\":[\"Unable to generate analysis at this time.\"],\"error\":\"" + escapeJson(e.getMessage()) + "\"}");
        }
    }

    private static List<String> generateInsights(Map<String, Object> data) {
        List<String> insights = new ArrayList<>();

        Double price = getDouble(data, "price");
        Double previousClose = getDouble(data, "previousClose");
        Double change = getDouble(data, "change");
        Double changePercent = getDouble(data, "changePercent");
        Double high52 = getDouble(data, "fiftyTwoWeekHigh");
        Double low52 = getDouble(data, "fiftyTwoWeekLow");
        Double volume = getDouble(data, "volume");
        Double avgVolume = getDouble(data, "avgVolume");
        Double pe = getDouble(data, "peRatio");
        Double forwardPE = getDouble(data, "forwardPE");
        Double beta = getDouble(data, "beta");
        Double marketCap = getDouble(data, "marketCap");
        Double priceToBook = getDouble(data, "priceToBook");
        Double dividendYield = getDouble(data, "dividendYield");
        Double eps = getDouble(data, "eps");
        String name = getString(data, "name");

        // Price movement
        if (change != null && changePercent != null) {
            String direction = change >= 0 ? "up" : "down";
            String absChange = String.format("$%.2f", Math.abs(change));
            String absPercent = String.format("%.2f%%", Math.abs(changePercent));

            if (Math.abs(changePercent) < 0.5) {
                insights.add("The stock is trading roughly flat today, " + direction + " just " + absPercent + ". This suggests a quiet trading session with no major catalysts.");
            } else if (Math.abs(changePercent) < 2.0) {
                insights.add("The stock is " + direction + " " + absPercent + " (" + absChange + ") today, showing moderate movement.");
            } else if (Math.abs(changePercent) < 5.0) {
                insights.add("The stock has moved significantly today, " + direction + " " + absPercent + " (" + absChange + "). This is a notable move that may reflect new information or market sentiment.");
            } else {
                insights.add("The stock is making a large move today, " + direction + " " + absPercent + " (" + absChange + "). Moves this size often indicate major news, earnings, or a significant shift in investor sentiment.");
            }
        }

        // 52-week range analysis
        if (price != null && high52 != null && low52 != null && high52 > low52) {
            double range = high52 - low52;
            double positionInRange = (price - low52) / range;
            double distFromHigh = ((high52 - price) / high52) * 100;
            double distFromLow = ((price - low52) / low52) * 100;

            if (positionInRange > 0.9) {
                insights.add(String.format("The stock is trading near its 52-week high (within %.1f%%), meaning it's near the highest price of the past year. This could indicate strong momentum, but some investors see it as a sign the stock may be expensive.", distFromHigh));
            } else if (positionInRange < 0.1) {
                insights.add(String.format("The stock is trading near its 52-week low (within %.1f%% above it). This could represent a buying opportunity if the company's fundamentals are sound, or it could signal ongoing challenges.", distFromLow));
            } else if (positionInRange > 0.65) {
                insights.add("The stock is in the upper portion of its 52-week range, suggesting a generally positive trend over the past year.");
            } else if (positionInRange < 0.35) {
                insights.add("The stock is in the lower portion of its 52-week range, which may indicate the stock has faced headwinds recently.");
            } else {
                insights.add("The stock is trading near the middle of its 52-week range, suggesting balanced sentiment among investors.");
            }
        }

        // Volume analysis
        if (volume != null && avgVolume != null && avgVolume > 0) {
            double volumeRatio = volume / avgVolume;

            if (volumeRatio > 2.0) {
                insights.add(String.format("Trading volume is significantly above average (%.1fx normal). Heavy volume often means strong conviction behind today's price move \u2014 whether buyers or sellers are in control.", volumeRatio));
            } else if (volumeRatio > 1.3) {
                insights.add("Trading volume is above average today, suggesting increased investor interest compared to a typical session.");
            } else if (volumeRatio < 0.5) {
                insights.add("Trading volume is well below average today, which may indicate low conviction or a wait-and-see attitude among investors.");
            } else if (volumeRatio < 0.7) {
                insights.add("Trading volume is below average today, suggesting a relatively quiet session for this stock.");
            } else {
                insights.add("Trading volume is near its average level, indicating a typical day in terms of market participation.");
            }
        }

        // P/E Ratio analysis
        if (pe != null) {
            if (pe < 0) {
                insights.add("The P/E ratio is negative, meaning the company is currently not profitable. This is common for growth-stage companies that are investing heavily in expansion.");
            } else if (pe < 12) {
                insights.add(String.format("The P/E ratio of %.1f is relatively low, which may suggest the stock is undervalued or that investors have modest expectations for future growth.", pe));
            } else if (pe < 25) {
                insights.add(String.format("The P/E ratio of %.1f is in a moderate range, suggesting a balance between the stock's current earnings and investor expectations.", pe));
            } else if (pe < 50) {
                insights.add(String.format("The P/E ratio of %.1f is relatively high. This often means investors expect strong future earnings growth to justify the premium price.", pe));
            } else {
                insights.add(String.format("The P/E ratio of %.1f is very high. This may indicate that investors have extremely high growth expectations, or that recent earnings were unusually low. High P/E stocks can be volatile.", pe));
            }

            // Forward P/E comparison
            if (forwardPE != null && forwardPE > 0 && pe > 0) {
                if (forwardPE < pe * 0.8) {
                    insights.add(String.format("The forward P/E (%.1f) is notably lower than the trailing P/E (%.1f), suggesting analysts expect earnings to grow significantly.", forwardPE, pe));
                } else if (forwardPE > pe * 1.2) {
                    insights.add(String.format("The forward P/E (%.1f) is higher than the trailing P/E (%.1f), which may suggest analysts expect earnings to decline.", forwardPE, pe));
                }
            }
        }

        // Beta analysis
        if (beta != null) {
            if (beta < 0.5) {
                insights.add(String.format("With a beta of %.2f, this stock is significantly less volatile than the overall market. It tends to move less during market swings, which can be appealing for conservative investors.", beta));
            } else if (beta < 0.8) {
                insights.add(String.format("The beta of %.2f indicates this stock is somewhat less volatile than the market average, making it a relatively stable holding.", beta));
            } else if (beta <= 1.2) {
                insights.add(String.format("The beta of %.2f means this stock moves roughly in line with the overall market.", beta));
            } else if (beta <= 1.5) {
                insights.add(String.format("With a beta of %.2f, this stock is more volatile than the market. It tends to amplify market movements \u2014 going up more on good days and down more on bad days.", beta));
            } else {
                insights.add(String.format("The beta of %.2f indicates high volatility compared to the market. This stock can see large swings and is generally considered higher-risk, higher-reward.", beta));
            }
        }

        // Market cap classification
        if (marketCap != null) {
            String capCategory;
            if (marketCap >= 200_000_000_000.0) {
                capCategory = "mega-cap";
            } else if (marketCap >= 10_000_000_000.0) {
                capCategory = "large-cap";
            } else if (marketCap >= 2_000_000_000.0) {
                capCategory = "mid-cap";
            } else if (marketCap >= 300_000_000.0) {
                capCategory = "small-cap";
            } else {
                capCategory = "micro-cap";
            }
            insights.add(String.format("This is a %s company with a market capitalization of %s. %s",
                capCategory,
                formatLargeNumber(marketCap),
                getCapDescription(capCategory)));
        }

        // Dividend yield (yfinance returns this as a percentage value, e.g. 0.41 = 0.41%)
        if (dividendYield != null && dividendYield > 0) {
            double yieldPercent = dividendYield;
            if (yieldPercent > 4.0) {
                insights.add(String.format("The dividend yield of %.2f%% is above average, which may be attractive for income-focused investors. However, very high yields sometimes indicate the market expects the dividend to be cut.", yieldPercent));
            } else if (yieldPercent > 1.5) {
                insights.add(String.format("The stock pays a dividend yield of %.2f%%, providing a moderate income stream to shareholders on top of any price appreciation.", yieldPercent));
            } else {
                insights.add(String.format("The stock has a modest dividend yield of %.2f%%. The company returns some earnings to shareholders while likely reinvesting most profits for growth.", yieldPercent));
            }
        }

        // Price to Book
        if (priceToBook != null) {
            if (priceToBook < 1.0) {
                insights.add(String.format("The price-to-book ratio of %.2f means the stock is trading below its book value, which some investors consider a sign of undervaluation.", priceToBook));
            } else if (priceToBook < 3.0) {
                insights.add(String.format("The price-to-book ratio of %.2f is in a moderate range.", priceToBook));
            } else if (priceToBook > 10.0) {
                insights.add(String.format("The price-to-book ratio of %.2f is quite high, typical of companies where value comes from intangible assets like brand, technology, or intellectual property rather than physical assets.", priceToBook));
            }
        }

        if (insights.isEmpty()) {
            insights.add("Limited data is available for detailed analysis of this stock at this time.");
        }

        return insights;
    }

    private static String getCapDescription(String category) {
        switch (category) {
            case "mega-cap": return "Mega-cap companies are among the largest in the world, typically very stable with global brand recognition.";
            case "large-cap": return "Large-cap companies are well-established and generally considered lower-risk investments.";
            case "mid-cap": return "Mid-cap companies often offer a balance between growth potential and stability.";
            case "small-cap": return "Small-cap companies can offer higher growth potential but tend to carry more risk and volatility.";
            case "micro-cap": return "Micro-cap companies are very small and can be highly volatile. They often have limited analyst coverage.";
            default: return "";
        }
    }

    private static String formatLargeNumber(double num) {
        if (num >= 1_000_000_000_000.0) return String.format("$%.2fT", num / 1_000_000_000_000.0);
        if (num >= 1_000_000_000.0) return String.format("$%.2fB", num / 1_000_000_000.0);
        if (num >= 1_000_000.0) return String.format("$%.2fM", num / 1_000_000.0);
        return String.format("$%.0f", num);
    }

    // Simple JSON parser for flat objects with string/number values
    private static Map<String, Object> parseSimpleJson(String json) {
        Map<String, Object> map = new HashMap<>();
        json = json.trim();
        if (json.startsWith("{")) json = json.substring(1);
        if (json.endsWith("}")) json = json.substring(0, json.length() - 1);

        int i = 0;
        while (i < json.length()) {
            // Find key
            int keyStart = json.indexOf('"', i);
            if (keyStart == -1) break;
            int keyEnd = json.indexOf('"', keyStart + 1);
            if (keyEnd == -1) break;
            String key = json.substring(keyStart + 1, keyEnd);

            // Find colon
            int colon = json.indexOf(':', keyEnd);
            if (colon == -1) break;

            // Find value
            int valStart = colon + 1;
            while (valStart < json.length() && json.charAt(valStart) == ' ') valStart++;

            if (valStart >= json.length()) break;

            char first = json.charAt(valStart);
            if (first == '"') {
                // String value
                int valEnd = json.indexOf('"', valStart + 1);
                if (valEnd == -1) break;
                map.put(key, json.substring(valStart + 1, valEnd));
                i = valEnd + 1;
            } else if (first == 'n') {
                // null
                map.put(key, null);
                i = valStart + 4;
            } else if (first == 't') {
                map.put(key, true);
                i = valStart + 4;
            } else if (first == 'f') {
                map.put(key, false);
                i = valStart + 5;
            } else {
                // Number
                int valEnd = valStart;
                while (valEnd < json.length() && json.charAt(valEnd) != ',' && json.charAt(valEnd) != '}' && json.charAt(valEnd) != ' ') {
                    valEnd++;
                }
                String numStr = json.substring(valStart, valEnd).trim();
                try {
                    if (numStr.contains(".")) {
                        map.put(key, Double.parseDouble(numStr));
                    } else {
                        double d = Double.parseDouble(numStr);
                        map.put(key, d);
                    }
                } catch (NumberFormatException e) {
                    map.put(key, numStr);
                }
                i = valEnd;
            }

            // Skip comma
            int nextComma = json.indexOf(',', i);
            if (nextComma == -1) break;
            i = nextComma + 1;
        }

        return map;
    }

    private static Double getDouble(Map<String, Object> map, String key) {
        Object val = map.get(key);
        if (val == null) return null;
        if (val instanceof Double) return (Double) val;
        if (val instanceof Number) return ((Number) val).doubleValue();
        try { return Double.parseDouble(val.toString()); } catch (Exception e) { return null; }
    }

    private static String getString(Map<String, Object> map, String key) {
        Object val = map.get(key);
        return val != null ? val.toString() : "";
    }

    private static String escapeJson(String s) {
        if (s == null) return "";
        return s.replace("\\", "\\\\")
                .replace("\"", "\\\"")
                .replace("\n", "\\n")
                .replace("\r", "\\r")
                .replace("\t", "\\t");
    }
}
