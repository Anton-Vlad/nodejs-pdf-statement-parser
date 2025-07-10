const path = require("path");
const fs = require("fs/promises");

const { parseCounterparties } = require("./utils/counterpartiesHelpers");

async function main() {
  const args = process.argv.slice(2);

  if (args[0]) {
    const filePath = args[0];
    // const fileName = path.parse(filePath).name;
    const outputPath = path.format({
      dir: path.dirname(filePath),
      name: "counterparties",
      ext: ".json",
    });

    try {
      const result = await parseCounterparties(filePath);
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
