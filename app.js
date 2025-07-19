const path = require("path");
const fs = require("fs/promises");

const {
  parseStatement,
  analyzeFolder,
  getStatementOutputFileName,
} = require("./utils/statementHelpers");
const { updateCounterpartiesTags } = require("./utils/counterpartiesHelpers");

async function main() {
  const args = process.argv.slice(2);
  const timestamp = Date.now();
  const outputDir = path.join(__dirname, "output");
  const logsDir = path.join(__dirname, "logs");
  let outputPath = path.join(outputDir, `transactions_${timestamp}.json`);

  await fs.mkdir(outputDir, { recursive: true });
  await fs.mkdir(logsDir, { recursive: true });

  if (args[0] === "--folder" && args[1]) {
    const folderPath = args[1];

    try {
      console.log(`Analyzing folder: ${folderPath}`);
      const results = await analyzeFolder(folderPath);
      await fs.writeFile(outputPath, JSON.stringify(results, null, 2), "utf8");
      console.log(`Summary written to ${outputPath}`);
    } catch (err) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  } else if (args[0] === "--tags" && args[1]) {
    const filePath = args[1]; // should be in the expected format of a statment json

    try {
      console.log(`Analyzing tags...`);

      await updateCounterpartiesTags(filePath);

      console.log(
        `Counterparty Rules knowledge base updated with latest tags mapping.`
      );
    } catch (err) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  } else if (args.length === 1 && args[0]) {
    const filePath = args[0];
    const fileName = path.parse(filePath).name;

    try {
      const result = await parseStatement(filePath, fileName);

      const outputFileName = getStatementOutputFileName(result);
      outputPath = path.join(outputDir, outputFileName);

      await fs.writeFile(outputPath, JSON.stringify(result, null, 2), "utf8");
      console.log(`Output written to ${outputPath}`);
    } catch (err) {
      console.error(`Error: ${err.message}`);
      process.exit(1);
    }
  } else {
    console.error(
      "Usage:\n  node app.js <file.pdf>\n  node app.js --folder <folder>"
    );
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
