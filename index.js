const functions = require("@google-cloud/functions-framework");
const puppeteer = require("puppeteer");
const axios = require("axios");
const UserAgent = require("user-agents");
// const downloadBrowsers = require("puppeteer/src/node/install")

const CA_COUNTRY_CODE = "+1";
const PERSONAL_NUMBER = "2368823713";
const TWILIO_NUMBER = "7787215623";

functions.cloudEvent("forexRates", async (cloudEvent) => {
  const marketRate = await getMarketRate();
  const mgRate = await getRateFromExchangeService();

  console.log("MG rate: ", mgRate);
  console.log("Market rate: ", marketRate);

  // const rateDiff = (marketRate - mgRate).toPrecision(3);

  // let standardMessage = `Market Rate: Rs.${marketRate}, MoneyGram Rate: Rs.${mgRate}(Rate diff:${rateDiff}). `;

  // if (rateDiff < 0.5) {
  //   console.log("Storing Rates...");
  //   storeRates(marketRate, mgRate, rateDiff);
  //   standardMessage += "Results stored in Firebase.";
  // }

  // if (rateDiff < 0.75) {
  //   console.log(`Rate difference is good(${rateDiff}), sending SMS...`);
  //   return sendSMS(standardMessage);
  // } else {
  //   console.log(`Rate Difference(Rs. ${marketRate} - Rs. ${mgRate} = ${rateDiff}) not good enough, no SMS sent.`);
  //   return 0;
  // }
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

// Get Rate from Exchange Service
const getRateFromExchangeService = async () => {
  const page = await getPageFromPuppeteer();

  await page.goto("https://www.moneygram.com/mgo/ca/en/", {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });

  await page.waitForSelector("#getStarted");

  //   page.evaluate(() => {
  //     try {
  //       document.querySelector("#truste-consent-track").style.display = "none";
  //     } catch (e) {
  //       console.log("Could not hide the consent footer!!");
  //     }
  //   });
  //   page.evaluate(() => {
  //     try {
  //       document.querySelector(".cdk-overlay-container").style.display = "none";
  //     } catch (e) {
  //       console.log("Could not hide the modal!!");
  //     }
  //   });
  const receiverCountryField = await page
    .$("#mfReceiverCountryField")
    .getElementsByTagName("input")[0];
  await receiverCountryField.clickCount({ clickCount: 2 });
  // Option India
  await page.$("#mat-option-502").click();
  //   const sendAmountInput = await page.$("#send");
  //   await sendAmountInput.click({ clickCount: 3 });
  //   await sendAmountInput.type("1");

  //   const receiverCountryInput = await page.$("#receiveCountry");
  //   await receiverCountryInput.type("India");

  //   await page.keyboard.press("Enter");
  //   await page.keyboard.press("Enter");

  //   await page.waitForSelector("#receiveAmount");

  //   const mgRate = await page.evaluate(() => {
  //     return document.querySelector("#receiveAmount").value;
  //   });

  //   await browser.close();

  return Number(0).toPrecision(4);
};
