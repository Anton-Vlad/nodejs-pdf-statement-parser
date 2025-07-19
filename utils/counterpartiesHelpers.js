const path = require("path");
const fs = require("fs/promises");
const { parseLocaleNumber } = require("./numbersHelpers");

function normalizeCounterparty(transaction, RULES) {
  for (const rule of RULES) {
    for (let i = 0; i < rule.patterns.length; i++) {
      const pattern = rule.patterns[i];
      const regex = new RegExp(pattern.value, "i");
      let fieldValue = transaction[pattern.field];
      if (Array.isArray(fieldValue)) {
        fieldValue = fieldValue.join(" ");
      }
      if (regex.test(fieldValue)) {
        return rule.name;
      }
    }
  }

  return null;
}

async function parseCounterparties(filePath) {
  let fileContent = await fs.readFile(filePath);

  const RULES = JSON.parse(
    await fs.readFile(path.join(__dirname, "../rules/counterpartyRules.json"))
  );

  const data = JSON.parse(fileContent);
  const output = {};

  for (const [iban, account] of Object.entries(data)) {
    // output[iban] = {};

    for (const transaction of account.transactions) {
      const counterparty = normalizeCounterparty(transaction, RULES);

      if (!output[counterparty]) {
        output[counterparty] = {
          count: 0,
          total: 0,
          transactions: [],
        };
      }

      output[counterparty].count += 1;

      const amount = parseLocaleNumber(transaction.amount);
      console.log(
        `Counterparty: ${counterparty}, Amount: ${amount}`,
        transaction
      );

      if (transaction.type === "expense") {
        output[counterparty].total -= parseLocaleNumber(transaction.amount);
      } else if (transaction.type === "income") {
        output[counterparty].total += parseLocaleNumber(transaction.amount);
      }

      if (counterparty === null) {
        // output[counterparty].transactions.push(transaction);
      }
      // output[iban][counterparty].transactions.push(transaction);
    }
  }

  return output;
}

async function updateCounterpartiesTags(filePath) {
  const counterpartyKnowledgeBaseJson = JSON.parse(
    await fs.readFile(path.join(__dirname, "../rules/counterpartyRules.json"))
  );

  let statementJson = JSON.parse(
    await fs.readFile(filePath)
  );

  const transactions = Object.values(statementJson).flatMap(
    (account) => account.transactions
  );

  for (let i = 0; i < transactions.length; i++) {
    const transaction = transactions[i];
    const counterpartyId = transaction.counterparty.id;
    const counterpartyIndex = counterpartyKnowledgeBaseJson.findIndex(c => c.name === counterpartyId);

    if (counterpartyIndex >= 0) {
      counterpartyKnowledgeBaseJson[counterpartyIndex].tag = transaction.tag;
    }
  }

  await fs.writeFile(
    path.join(__dirname, "../rules/counterpartyRules.json"),
    JSON.stringify(counterpartyKnowledgeBaseJson, null, 2),
    "utf8"
  );
}

module.exports = {
  parseCounterparties,
  normalizeCounterparty,
  updateCounterpartiesTags
};
