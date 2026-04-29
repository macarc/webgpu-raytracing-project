// From PipeScore: https://github.com/macarc/PipeScore/blob/main/src/common/file.ts
export async function readFile(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const reader = new FileReader();
    reader.readAsText(file, "UTF-8");
    reader.addEventListener("error", rej);
    reader.addEventListener("load", (e) => {
      const data = e.target?.result;
      if (data) res(data.toString());
    });
  });
}

export function saveFile(
  name: string,
  contents: string | ArrayBuffer,
  type: string,
) {
  const blob = new Blob([contents], { type });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
}
