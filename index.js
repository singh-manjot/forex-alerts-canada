const functions = require("@google-cloud/functions-framework");
const puppeteer = require("puppeteer");
const axios = require("axios");
const UserAgent = require("user-agents");
const sendgrid = require("@sendgrid/mail");

functions.cloudEvent("forexRates", async () => {
  const marketRate = await getMarketRate();
  const exchangeRate = await getRateFromExchangeService();

  logRates(marketRate, exchangeRate);

  const rateDiff = (marketRate - exchangeRate).toPrecision(3);

  if (rateDiff < 0.6) {
    console.log(`Rate difference is good(${rateDiff}), sending email...`);
    sendEmail(marketRate, exchangeRate);
  } else {
    console.log(
      `Rate Difference is not good enough: (Rs: ${rateDiff}), no SMS sent.`
    );
  }
});

// Get Market data
const getMarketRate = async () => {
  const exchangeData = await axios
    .get(`https://open.er-api.com/v6/latest/CAD`)
    .then((response) => {
      const data = response.data;
      if (data.result.toLowerCase() !== "success") {
        throw new Error(
          `Received unsuccesfull response from Market Rates: ${data.result}`
        );
      }
      return data.rates;
    })
    .catch((err) => {
      console.log("ERROR: ", err);
    });

  return (exchangeData["INR"] ?? 0).toPrecision(4);
};

// Get Rate from Exchange Service
const getRateFromExchangeService = async () => {
  const page = await getPageFromPuppeteer();
  const wuRate = await getRateFromWesternUnion(page);

  return Number(wuRate).toPrecision(4);
};

const getRateFromMoneyGram = async (page) => {
  let mgRate;

  await page.goto("https://www.moneygram.com/mgo/ca/en/", {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });

  const receiverCountryField = await page.evaluate(() => {
    return document.querySelector("#mfReceiverCountryField input");
  });

  if (receiverCountryField) {
    await receiverCountryField.click({ clickCount: 2 });
    await receiverCountryField.type("India");
    await page.keyboard.press("Enter");
    // await page.waitForSelector("#receiveAmount");

    const mgRate = await page.evaluate(() => {
      return document.querySelector("#receiveAmount").value;
    });
  }

  return mgRate;
};

const getRateFromWesternUnion = async (page) => {
  await page.goto("https://www.westernunion.com/ca/en/home.html", {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });

  await page.waitForSelector("li[data-currencycode='INR']");

  await page.evaluate(() => {
    // Click the list item with INR
    document.querySelector("li[data-currencycode='INR']").click();
  });

  // Wait for dropdown to update to INR
  await page.waitForFunction(
    "document.getElementById('default-receiver-currency-code').innerText = \"INR\""
  );

  // Wait for exchange rate in span to update to INR 
    await page.waitForFunction(
      "document.querySelector(\"span[data-receiver-currency-fee='0.00']\").innerText.includes('INR')"
    );

  const forexText = await page.evaluate(() => {
    // Get forex rate
    return document.querySelector("span[data-receiver-currency-fee='0.00']")
      .innerText;
  });

  return forexText.split(" ")[0];
};

const sendEmail = (marketRate, exchangeRate) => {
  const canSendEmail = hasValidEmailRequirements();

  if (canSendEmail) {
    sendgrid.setApiKey(process.env.SENDGRID_API_KEY);
    const email = {
      to: process.env.RECEIVER_EMAIL,
      from: process.env.SENDGRID_VERIFIED_SENDER,
      subject: "Should we send money back home?",
      text: "Good exchange rates detected by CR. You might wanna consider sending now!",
      html: `<h2>Market Rate:<h2>${marketRate}<br><h2>Exchange Rate:<h2>${exchangeRate}<br>`,
    };

    sendgrid
      .send(email)
      .then(() => {
        console.log("Email sent.");
      })
      .catch((error) => {
        console.log(`Failed to send email: ${error}`);
        console.log("Logging rates and exiting.");
        logRates(marketRate, exchangeRate);
      });
  }
};

const logRates = (marketRate, exchangeRate) => {
  console.log("Market rate: ", marketRate);
  console.log("Exchange rate: ", exchangeRate);
};

const hasValidEmailRequirements = () => {
  const apiKey = process.env.SENDGRID_API_KEY;
  const sendgridVerifiedSender = process.env.SENDGRID_VERIFIED_SENDER;
  const receiverEmail = process.env.RECEIVER_EMAIL;

  if (!apiKey) {
    console.log("Could not find email API key.");
  }

  if (!sendgridVerifiedSender) {
    console.log("Could not find a verified sender email.");
  }

  if (!receiverEmail) {
    console.log("Could not find an address to send email to.");
  }

  if (!apiKey || !sendgridVerifiedSender || !receiverEmail) {
    console.log("Logging rates and exiting due to missing email information.");
    logRates(marketRate, exchangeRate);
  }

  return apiKey && receiverEmail && receiverEmail;
};

const getPageFromPuppeteer = async () => {
  const userAgent = new UserAgent({
    deviceCategory: "desktop",
    platform: "Linux x86_64",
  });

  const browser = await puppeteer.launch({
    //running chrome as root is not supported directly
    args: ["--no-sandbox", `--user-agent=${userAgent}`],
  });

  return browser.newPage();
};
