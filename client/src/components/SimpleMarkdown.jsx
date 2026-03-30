// Simple inline markdown renderer — no external deps.
// Caller controls appearance via the `className` prop (child selectors on h2, h3, p, ul, li, strong).

function parseBold(str) {
  const parts = str.split(/\*\*(.*?)\*\*/g);
  return parts.map((p, i) =>
    i % 2 === 1 ? <strong key={i}>{p}</strong> : p
  );
}

export default function SimpleMarkdown({ text, className }) {
  const elements = [];
  let listItems = [];

  const flushList = (key) => {
    if (listItems.length > 0) {
      elements.push(<ul key={`ul-${key}`}>{listItems}</ul>);
      listItems = [];
    }
  };

  text.split('\n').forEach((line, i) => {
    if (line.startsWith('## ')) {
      flushList(i);
      elements.push(<h3 key={i}>{parseBold(line.slice(3))}</h3>);
    } else if (line.startsWith('# ')) {
      flushList(i);
      elements.push(<h2 key={i}>{parseBold(line.slice(2))}</h2>);
    } else if (/^[-*] /.test(line)) {
      listItems.push(<li key={i}>{parseBold(line.slice(2))}</li>);
    } else if (line.trim() !== '') {
      flushList(i);
      elements.push(<p key={i}>{parseBold(line)}</p>);
    } else {
      flushList(i);
    }
  });
  flushList('end');

  return <div className={className}>{elements}</div>;
}
