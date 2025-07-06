const TYPE_INCOME = "income";
const TYPE_EXPENSE = "expense";

function btIdentifyBank(text) {
  if (
    text.includes("J12 / 4155 / 1993 • R.B. - P.J.R - 12 - 019") ||
    text.includes("J12/4155/1993 • R.B. - P.J.R-12-019") || 
    text.includes("Nr. Inreg. Registrul Comertului: J1993004155124")
  ) {
    return "BT";
  }

  return null;
}

function btExtractInitialBalance(text) {
  // Define a regular expression pattern to identify the line with "SOLD ANTERIOR" and extract the following amount
  const balanceRegex = /SOLD ANTERIOR\s*\n(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/;
  const match2 = text.match(balanceRegex);
  if (match2 && match2[1]) {
    // Replace commas used as thousand separators (if any) and convert the string to a float number
    const balance = parseFloat(match2[1].replace(/,/g, ""));
    return balance;
  }
  return null; // Return null if no match is found or if parsing fails
}

function btExtractFinalBalance(text) {
  // Define a regular expression pattern to identify the line with "SOLD FINAL CONT" and capture the following amount
  const balanceRegex =
    /SOLD FINAL CONT\s*\n(\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})?)/;
  const match2 = text.match(balanceRegex);
  if (match2 && match2[1]) {
    // Normalize the captured amount to handle different thousand separators and decimal points
    const normalizedAmount = match2[1].replace(/,/g, "").replace(/\./g, "");
    const balance = parseFloat(normalizedAmount) / 100; // Convert string to float and adjust for cents
    return balance;
  }
  return null; // Return null if no match is found
}

function btExtractCurrency(text) {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const currencyRegex = /([A-Z]{3})Cod IBAN:/i;

  for (let i = 0; i < lines.length; i++) {
    const currencyMatch = lines[i].match(currencyRegex);
    if (currencyMatch) {
        return currencyMatch[1].trim().toUpperCase();
    }
  }

  return null;
}

function btExtractStatementDates(text) {
  const dateRegex = /(\d{2})\/(\d{2})\/(\d{4}) - (\d{2})\/(\d{2})\/(\d{4})/;
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  let startDate = null;
  let endDate = null;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith("EXTRAS CONT")) {
      const match = lines[i].match(dateRegex);
      if (match) {
        startDate = `${match[3]}-${match[2]}-${match[1]}`; // YYYY-MM-DD
        endDate = `${match[6]}-${match[5]}-${match[4]}`; // YYYY-MM-DD
        break;
      }
    }
  }

  return {
    startDate,
    endDate,
  };
}

function btStatementParse(text, currency = 'RON') {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    const transactions = [];

    const BT_TRANSACTION_KEYWORDS = [
        "Plata la POS",
        // "Plata la POS non-BT cu card VISA",
        "Retragere de numerar de la ATM BT",
        "Comision incasare OP",
        "Incasare ", // "Instant"
        "Incasare OP",
        "Rambursare principal credit",
        "Dobanda credit",
        "Abonament BT 24",
        "Depunere numerar ATM",
        "Plata OP intra - canal electronic",
        "365",
        "P2P BTPay",
        "Plata valutara intra",
        "Transfer intern"
    ];

    const dateRegex = /(\d{2})\/(\d{2})\/(\d{4})/;
    const amountRegex = /^\d{1,3}(?:[.,]\d{3})*(?:[.,]\d{2})$/;
    const refRegex = /^REF[:.\s]/i;
    const valueLineRegex = /valoare tranzactie: ([\d.,]+)\s+([A-Z]{3})/i;
    const locationRegex = /(?:TID|MID)[:\s]+\S+\s+(.+?)\s+(?:RO|ROM|RON|RRN)\b/;

    let currentDate = null;
    let current = null;
    let refSeen = false;
    let skipLines = false;

    function tryExtractAmountFromLines(lines) {
        for (let line of lines) {
            // Priority 1: valoare tranzactie
            const valueMatch = line.match(valueLineRegex);
            if (valueMatch) {
                return valueMatch[1]; //parseFloat(valueMatch[1].replace(/\./g, '').replace(',', '.'));
            }

            // Priority 2: generic amount on any line
            const tokens = line.split(/\s+/);
            for (let t of tokens) {
                if (amountRegex.test(t)) {
                    return t; // parseFloat(t.replace(/\./g, '').replace(',', '.'));
                }
            }
        }
        return null;
    }

    for (let i = 0; i < lines.length; i++) {
        const prevline = lines[i-1] ? lines[i-1].trim() : '';
        const line = lines[i].trim();

        if (line.startsWith('Clasificare BT')) {
            // Skip lines until we find a transaction header
            skipLines = true;
            continue;
        }

        if (line.startsWith('DataDescriere')) {
            skipLines = false;
            continue;
        }

        if (skipLines) {
            continue;
        }
 
        const headerMatch = BT_TRANSACTION_KEYWORDS.find(h => line.startsWith(h));
        const isHeader = Boolean(headerMatch);

        if (isHeader) {
            // Finalize previous transaction
            if (current) {
                // Ensure amount
                if (current.amount === null) {
                    const amount = tryExtractAmountFromLines(current.details);
                    if (amount !== null) current.amount = amount;
                }

                // Location
                const joined = current.details.join(' ');
                const locMatch = joined.match(locationRegex);
                if (locMatch) current.location = locMatch[1].trim();

                transactions.push(current);
            }

            // Start new transaction
            current = {
                name: headerMatch,
                date: currentDate,
                amount: null,
                currency,
                type: line.toLowerCase().startsWith('incasare') ? TYPE_INCOME : TYPE_EXPENSE,
                details: [],
                reference: null,
                location: null
            };

            const rest = line.slice(headerMatch.length).trim();
            if (amountRegex.test(rest)) {
                current.amount = rest; //parseFloat(rest.replace(/\./g, '').replace(',', '.'));
            }

            const dateMatch = prevline.match(dateRegex);
            if (dateMatch) {
                currentDate = `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`;
            }
            current.date = currentDate; // else, current date will be same as previous transaction}

            refSeen = false;
            continue;

        } else if (current && !refSeen) {

            // REF detection
            if (refRegex.test(line)) {
                refSeen = true;

                // Try amount on *next* line
                const nextLine = lines[i + 1];
                if (nextLine && amountRegex.test(nextLine.trim())) {
                    current.amount = nextLine; //parseFloat(nextLine.trim().replace(/\./g, '').replace(',', '.'));
                }

                current.reference = line.replace(refRegex, '').trim();
                continue;
            }

            // Location
            if (!current.location) {
                const locMatch = line.match(locationRegex);
                if (locMatch) {
                    current.location = locMatch[1].trim();
                }
            }

            current.details.push(line);
        }
    }

    // Final push
    if (current) {
        if (current.amount === null) {
            const amount = tryExtractAmountFromLines(current.details);
            if (amount !== null) current.amount = amount;
        }

        const joined = current.details.join(' ');
        const locMatch = joined.match(locationRegex);
        if (locMatch) current.location = locMatch[1].trim();

        transactions.push(current);
    }

    return transactions;
}

module.exports = {
  btExtractInitialBalance,
  btExtractFinalBalance,
  btExtractCurrency,
  btIdentifyBank,
  btExtractStatementDates,
  btStatementParse
};
