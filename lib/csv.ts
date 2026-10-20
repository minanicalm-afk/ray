export function toCsv(rows: string[][]) {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          if (/[",\n]/.test(cell)) return `"${cell.replaceAll('"', '""')}"`
          return cell
        })
        .join(","),
    )
    .join("\n")
}
