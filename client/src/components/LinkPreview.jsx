const URL_RE = /https?:\/\/[^\s<]+/;

function getDomain(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); }
  catch { return null; }
}

export default function LinkPreview({ text }) {
  const match = text?.match(URL_RE);
  if (!match) return null;
  const domain = getDomain(match[0]);
  if (!domain) return null;

  return (
    <a
      href={match[0]}
      target="_blank"
      rel="noopener noreferrer"
      className="link-preview"
      onClick={(e) => e.stopPropagation()}
    >
      <img
        src={`https://www.google.com/s2/favicons?domain=${domain}&sz=32`}
        alt=""
        className="link-preview__favicon"
        width="14"
        height="14"
        onError={(e) => { e.target.style.display = 'none'; }}
      />
      <span className="link-preview__domain">{domain}</span>
    </a>
  );
}
