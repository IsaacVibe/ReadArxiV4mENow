export function normalizeMathDelimiters(text: string, inline = false) {
  return text.split(/(```[\s\S]*?```|`[^`\n]*`)/g).map((part, index) => {
    if (index % 2) return part;
    let result = part.replace(/\\\[([\s\S]*?)\\\]/g, (_, value: string) => `\n$$\n${value}\n$$\n`)
      .replace(/\\\(([\s\S]*?)\\\)/g, (_, value: string) => `$${value}$`);
    if (inline) result = result.replace(/\$\$([\s\S]*?)\$\$/g, (_, value: string) => `$${value.trim()}$`).replace(/\r?\n/g, ' ');
    return result;
  }).join('');
}
