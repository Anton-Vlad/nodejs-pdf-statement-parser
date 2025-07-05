const fs = require("fs/promises");
const pdf = require("pdf-parse");
const {
  btStatementParse,
  btExtractStatementDate,
  btIdentifyBank,
  btExtractCurrency,
  btExtractInitialBalance,
  btExtractFinalBalance,
} = require("./btHelpers");
const {
  ingStatementParse,
  ingIdentifyBank,
  ingExtractInitialBalance,
  ingExtractFinalBalance,
} = require("./ingHelpers");

function getStatementBank(data) {
  if (ingIdentifyBank(data)) {
    return "ING";
  }
  if (btIdentifyBank(data)) {
    return "BT";
  }
  if (data.includes("REVOLT21")) {
    return "REV";
  }
  return null;
}

function extractStatementDates(text, bank) {
  switch (bank) {
    case "BT":
      return btExtractStatementDate(text);
      break;

    default:
      return "Unknown bank";
      break;
  }
}

function extractCurrency(text, bank) {
  switch (bank) {
    case "BT":
      return btExtractCurrency(text);
      break;

    default:
      return "Unknown bank";
      break;
  }
}

function extractInitialBalance(text, bank) {
  switch (bank) {
    case "ING":
      return ingExtractInitialBalance(text);
      break;
    case "BT":
      return btExtractInitialBalance(text);
      break;

    default:
      return null;
      break;
  }
}

function extractFinalBalance(text, bank) {
  switch (bank) {
    case "ING":
      return ingExtractFinalBalance(text);
      break;
    case "BT":
      return btExtractFinalBalance(text);
      break;

    default:
      return null;
      break;
  }
}

function extractIban(text) {
  // Enhanced regular expression to match an IBAN, including those with longer alphanumeric sequences
  const ibanRegex = /[A-Z]{2}\d{2}[A-Z0-9]{12,30}/;
  const match = text.match(ibanRegex);
  if (match) {
    return match[0];
  }
  return null;
}

function parseTransactions(data, bank, currency = "RON", numpages = 1) {
  switch (bank) {
    case "ING":
      return ingStatementParse(data, currency);
    case "BT":
      return btStatementParse(data, currency);

    default:
      return false;
      break;
  }
}

const parseStatement = async (filePath, fileName) => {
  let dataBuffer = await fs.readFile(filePath);
  const fileData = await pdf(dataBuffer);

  await fs.writeFile(fileName + "_log.txt", fileData.text, "utf8");

  const statementBank = getStatementBank(fileData.text);
  const statementIBAN = extractIban(fileData.text);
  const statementDates = extractStatementDates(fileData.text, statementBank);
  const statementCurrency = extractCurrency(fileData.text, statementBank);
  const statementInitialBalance = extractInitialBalance(
    fileData.text,
    statementBank
  );
  const statementFinalBalance = extractFinalBalance(
    fileData.text,
    statementBank
  );
  

  const transactions = parseTransactions(
    fileData.text,
    statementBank,
    statementCurrency,
    fileData.numpages
  );

  console.log(
    JSON.stringify({
      statementBank,
      statementCurrency,
      statementDates,
      statementInitialBalance,
      statementFinalBalance,
      statementIBAN,
      // transactions
    })
  );

  let out = {};
  out[statementIBAN] = {
    meta: {
      bank: statementBank,
      currency: statementCurrency,
      dates: statementDates,
      initialBalance: statementInitialBalance,
      finalBalance: statementFinalBalance,
    },
    transactions: transactions,
  }

  return out;
};

module.exports = {
  parseStatement,
};
