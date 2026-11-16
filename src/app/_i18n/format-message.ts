export function formatMessage(
  template: string,
  values: Readonly<Record<string, string | number>>,
): string {
  return template.replace(/\{(\w+)\}/g, (placeholder: string, name: string) => {
    const value = values[name];
    return value === undefined ? placeholder : String(value);
  });
}
