const path = require("path");
const fs = require("fs/promises");

function normalizeCounterparty(transaction, RULES) {
    for (const rule of RULES) {
        for (let i = 0; i < rule.patterns.length; i++) {
            const pattern = rule.patterns[i];
            const regex = new RegExp(pattern.value, "i");
            if (regex.test(transaction[pattern.field])) {
                return rule.name;
            }
        }
    }

    return "Unknown";
}

async function parseCounterparties(filePath) {
  let fileContent = await fs.readFile(filePath);

  const RULES = JSON.parse(await fs.readFile(
    path.join(__dirname, "../rules/counterpartyRules.json"),
  ));

  const data = JSON.parse(fileContent);
  const output = {};

  for (const [iban, account] of Object.entries(data)) {
    // output[iban] = {};

    for (const transaction of account.transactions) {
      const counterparty = normalizeCounterparty(transaction, RULES);

    //   console.log(`Counterparty: ${counterparty} for transaction: ${transaction.location}`);

      if (!output[counterparty]) {
        output[counterparty] = {
          count: 0,
          transactions: [],
        };
      }

      output[counterparty].count += 1;


      if (counterparty === 'Unknown') {
        // output[counterparty].transactions.push(transaction);
      }
      // output[iban][counterparty].transactions.push(transaction);
    }
  }

  return output;
}

module.exports = {
  parseCounterparties,
};
