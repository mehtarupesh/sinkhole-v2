const URL_RE = /(https?:\/\/[^\s<]+)/g;

export default function Linkify({ children }) {
  if (typeof children !== 'string') return children;
  const parts = children.split(URL_RE);
  if (parts.length === 1) return children;
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <a
        key={i}
        href={part}
        target="_blank"
        rel="noopener noreferrer"
        className="linkify"
        onClick={(e) => e.stopPropagation()}
      >
        {part}
      </a>
    ) : (
      part
    )
  );
}
