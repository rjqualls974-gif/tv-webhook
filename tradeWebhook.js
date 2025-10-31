import express from "express";
import bodyParser from "body-parser";
import fetch from "node-fetch";

const app = express();
app.use(bodyParser.json());

// health check
app.get("/", (req, res) => {
  res.send("strategy webhook alive");
});

// TradingView will POST here
app.post("/trade-alert", async (req, res) => {
  try {
    const alertData = req.body;

    // ===== Your trading rules go here =====
    const chatPrompt = `
You are my trade decision engine for GOLD on 15m.

Follow ONLY these rules:

RULE 1: BUY
- Bullish continuation if price broke and is holding ABOVE 4060.397 (resistance).
- Entry after retest and confirmation above that level (example: 4062+).
- Stop below 4030.
- Take profit 4090.
We only output BUY if that condition is active now.

RULE 2: SELL
- Bearish move if price FAILED to hold above 4060.397 and formed a lower high under it.
- Expect move down toward 3986.
- Entry around 4030.
- Stop above 4062.
- Take profit 3986.
We only output SELL if that condition is active now.

RULE 3: WAIT
- If neither clean setup is active, output WAIT.
- WAIT if price is just ranging between 4030 and 4060 with no control.

Market snapshot:
symbol: ${alertData.symbol}
timeframe: ${alertData.timeframe}
last_price: ${alertData.price}
last_candle_high: ${alertData.candle_high}
last_candle_low: ${alertData.candle_low}
rsi: ${alertData.rsi}
signal_type: ${alertData.signal_type}
key_level_resistance: ${alertData.key_level_resistance}
mid_support: ${alertData.mid_support}
downside_target: ${alertData.downside_target}
upside_target: ${alertData.upside_target}

OUTPUT FORMAT:
Return exactly ONE LINE in one of these formats:
1) "BUY | entry: #### | stop: #### | tp: ####"
2) "SELL | entry: #### | stop: #### | tp: ####"
3) "WAIT | reason: ...."
    `;

    // Call OpenAI chat completions API
    const gptResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-5-reasoning",
        messages: [
          {
            role: "system",
            content:
              "You output trading decisions with strict risk levels. No extra words."
          },
          {
            role: "user",
            content: chatPrompt
          }
        ],
        temperature: 0
      })
    });

    const gptJson = await gptResponse.json();
    const decisionText =
      gptJson?.choices?.[0]?.message?.content ??
      "WAIT | reason: no response";

    console.log("TRADE DECISION:", decisionText);

    // Return result to caller (TradingView or you testing with curl)
    res.json({
      decision: decisionText,
      raw: alertData
    });

  } catch (err) {
    console.error("ERROR:", err);
    res.status(500).json({
      decision: "WAIT | reason: internal error",
      error: err.toString()
    });
  }
});

// Render will inject PORT env var, respect it if present:
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`listening on port ${PORT}`);
});
