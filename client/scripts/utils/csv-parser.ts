/**
 * CSV Parser Utility
 * Parses CSV text into structured data objects
 */

/**
 * Parse CSV text into array of objects
 * @param csvText - Raw CSV text content
 * @returns Array of objects with properties matching CSV headers
 */
export function parseCSV<T>(csvText: string): T[] {
  const lines = csvText.trim().split('\n');
  if (lines.length === 0) {
    return [];
  }

  // Extract headers from first line
  const headers = lines[0].split(',').map((h) => h.trim());

  // Parse data rows
  const data: T[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map((v) => v.trim());
    const row: Record<string, string | number> = {};

    headers.forEach((header, index) => {
      const value = values[index];
      // Try to parse as number, otherwise keep as string
      row[header] = isNaN(Number(value)) ? value : Number(value);
    });

    data.push(row as T);
  }

  return data;
}

/**
 * Fetch and parse CSV file from URL
 * @param url - URL to CSV file
 * @returns Promise resolving to array of parsed objects
 */
export async function fetchCSV<T>(url: string): Promise<T[]> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch CSV: ${response.statusText}`);
    }
    const text = await response.text();
    return parseCSV<T>(text);
  } catch (error) {
    console.error(`Error fetching CSV from ${url}:`, error);
    throw error;
  }
}
