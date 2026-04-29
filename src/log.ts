// Logging functions.

export function error(...o: any[]) {
  console.error("[ERR]", ...o);
  alert("Error: " + o.join());
}

export function log(...o: any[]) {
  console.log("[LOG]", ...o);
}

export function ensure(t: boolean, ...message: any[]): boolean {
  if (!t) {
    error(message);
  }

  return t;
}
