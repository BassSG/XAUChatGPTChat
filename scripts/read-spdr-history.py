"""Read-only extraction of dated holdings from the official GLD XLSX archive.

Uses the Python standard library; never executes formulas, edits the workbook,
or extracts ZIP paths to disk. The collector validates dates and tonnes again.
"""
import json
import re
import sys
import xml.etree.ElementTree as ET
import zipfile

NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}

def extract(path):
    with zipfile.ZipFile(path) as archive:
        if sum(x.file_size for x in archive.infolist()) > 80 * 1024 * 1024:
            raise ValueError("SPDR workbook exceeds extraction size limit")
        strings = []
        if "xl/sharedStrings.xml" in archive.namelist():
            for node in ET.fromstring(archive.read("xl/sharedStrings.xml")).findall("m:si", NS):
                strings.append("".join(t.text or "" for t in node.findall(".//m:t", NS)))
        book = ET.fromstring(archive.read("xl/workbook.xml"))
        properties = book.find("m:workbookPr", NS)
        date1904 = properties is not None and properties.get("date1904") in ("1", "true")
        for name in archive.namelist():
            if not re.fullmatch(r"xl/worksheets/sheet\d+\.xml", name):
                continue
            rows = []
            for row in ET.fromstring(archive.read(name)).findall("m:sheetData/m:row", NS):
                values = {}
                for cell in row.findall("m:c", NS):
                    column = re.match(r"[A-Z]+", cell.get("r", ""))
                    if column is None:
                        continue
                    if cell.find("m:f", NS) is not None:
                        # Do not treat cached formula results as source holdings.
                        values[column[0]] = None
                        continue
                    value = cell.find("m:v", NS)
                    value = value.text if value is not None else "".join(t.text or "" for t in cell.findall(".//m:t", NS))
                    values[column[0]] = strings[int(value)] if cell.get("t") == "s" else value
                rows.append(values)
            for i, row in enumerate(rows[:25]):
                dates = [k for k, v in row.items() if str(v).strip().lower() == "date"]
                tonnes = [k for k, v in row.items() if str(v).strip().lower() == "tonnes of gold"]
                if len(dates) == 1 and len(tonnes) == 1:
                    return {"sheet": name, "dateHeader": row[dates[0]], "holdingsHeader": row[tonnes[0]],
                            "date1904": date1904, "rows": [{"date": r.get(dates[0]), "holdings": r.get(tonnes[0])}
                            for r in rows[i + 1:] if r.get(dates[0]) not in (None, "")]}
        raise ValueError("Official Date / Tonnes of Gold headers not found; do not guess columns")

if __name__ == "__main__":
    print(json.dumps(extract(sys.argv[1]), ensure_ascii=True))
