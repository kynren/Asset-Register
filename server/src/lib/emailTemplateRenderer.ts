export type EmailBlock =
  | { id: string; type: "heading"; text: string; align?: "left" | "center" | "right" }
  | { id: string; type: "text"; text: string; align?: "left" | "center" | "right" }
  | { id: string; type: "image"; url: string; alt?: string; width?: number; align?: "left" | "center" | "right" }
  | { id: string; type: "button"; text: string; url: string; color?: string }
  | { id: string; type: "divider" }
  | { id: string; type: "spacer"; height?: number };

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Escapes the surrounding text first, then fills in {{var}} tokens with escaped values — the
// tokens themselves survive escapeHtml (braces aren't special characters), so this order can't
// let a variable's value re-open an HTML tag from the block's own text.
export function interpolate(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => (key in variables ? escapeHtml(variables[key]) : match));
}

// For plain-text contexts (email subject line) — no HTML escaping, just substitution.
export function interpolatePlain(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => (key in variables ? variables[key] : match));
}

function renderBlockHtml(block: EmailBlock, variables: Record<string, string>): string {
  switch (block.type) {
    case "heading": {
      const text = interpolate(escapeHtml(block.text), variables).replace(/\n/g, "<br/>");
      return `<tr><td style="padding:20px 24px 8px;text-align:${block.align ?? "left"};"><h2 style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:22px;color:#1a1a2e;">${text}</h2></td></tr>`;
    }
    case "text": {
      const text = interpolate(escapeHtml(block.text), variables).replace(/\n/g, "<br/>");
      return `<tr><td style="padding:8px 24px;text-align:${block.align ?? "left"};font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#333333;">${text}</td></tr>`;
    }
    case "image": {
      const url = interpolatePlain(block.url, variables);
      const alt = block.alt ? interpolate(escapeHtml(block.alt), variables) : "";
      const width = block.width ? ` width="${block.width}"` : "";
      return `<tr><td style="padding:8px 24px;text-align:${block.align ?? "center"};"><img src="${escapeHtml(url)}" alt="${alt}"${width} style="max-width:100%;height:auto;border:0;display:inline-block;" /></td></tr>`;
    }
    case "button": {
      const text = interpolate(escapeHtml(block.text), variables);
      const url = interpolatePlain(block.url, variables);
      const color = block.color ?? "#7e14ff";
      return `<tr><td style="padding:20px 24px;text-align:center;"><a href="${escapeHtml(url)}" style="background:${color};color:#ffffff;padding:12px 28px;border-radius:6px;text-decoration:none;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:600;display:inline-block;">${text}</a></td></tr>`;
    }
    case "divider":
      return `<tr><td style="padding:8px 24px;"><hr style="border:none;border-top:1px solid #e2e2e2;margin:0;" /></td></tr>`;
    case "spacer": {
      const height = block.height ?? 24;
      return `<tr><td style="height:${height}px;line-height:${height}px;font-size:1px;">&nbsp;</td></tr>`;
    }
  }
}

export function renderEmailTemplate(
  subjectTemplate: string,
  blocks: EmailBlock[],
  variables: Record<string, string>
): { subject: string; html: string } {
  const subject = interpolatePlain(subjectTemplate, variables);
  const rows = blocks.map((block) => renderBlockHtml(block, variables)).join("\n");

  const html = `<!doctype html>
<html>
<body style="margin:0;padding:0;background:#f4f4f7;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f7;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;max-width:600px;width:100%;">
          ${rows}
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, html };
}
