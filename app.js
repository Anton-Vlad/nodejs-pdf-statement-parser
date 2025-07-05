const path = require("path");
const fs = require("fs/promises");
const pdf = require("pdf-parse");

const { parseStatement } = require("./utils/statementHelpers");

async function main() {
    const args = process.argv.slice(2);

    if (args[1] === '--folder' && args[0]) {
        const folderPath = args[1];
        const outputPath = path.join(folderPath, 'transactions.json');

        try {
            const results = {'mock': 'results'}; //await analyzeFolder(folderPath);
            await fs.writeFile(outputPath, JSON.stringify(results, null, 2), 'utf8');
            console.log(`Summary written to ${outputPath}`);
        } catch (err) {
            console.error(`Error: ${err.message}`);
            process.exit(1);
        }

    } else if (args[0]) {

        const filePath = args[0];
        const fileName = path.parse(filePath).name;
        const outputPath = path.format({
            dir: path.dirname(filePath),
            name: fileName + '_parsed',
            ext: '.json'
        });

        try {
            const result = await parseStatement(filePath, fileName);
            await fs.writeFile(outputPath, JSON.stringify(result, null, 2), 'utf8');
            console.log(`Output written to ${outputPath}`);
        } catch (err) {
            console.error(`Error: ${err.message}`);
            process.exit(1);
        }
    } else {
        console.error('Usage:\n  node app.js <file.pdf>\n  node app.js --folder <folder>');
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}