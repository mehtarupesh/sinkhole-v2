import Linkify from './Linkify';
import LinkPreview from './LinkPreview';

function BadgeIcon() {
  const s = { width: 11, height: 11, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true };
  return (
    <svg {...s}>
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="15" y2="12" />
      <line x1="3" y1="18" x2="18" y2="18" />
    </svg>
  );
}

function relativeDate(date) {
  const now = new Date();
  const d = new Date(date);
  const diff = Math.floor((now - d) / 86400000);
  if (diff === 0) return 'today';
  if (diff === 1) return '1d';
  if (diff < 30) return `${diff}d`;
  if (diff < 365) return `${Math.floor(diff / 30)}mo`;
  return `${Math.floor(diff / 365)}y`;
}

export function CarouselCard({ unit, onClick }) {
  const isImage = unit.type === 'image' && unit.mimeType?.startsWith('image/');
  const isFile = unit.type === 'image' && !unit.mimeType?.startsWith('image/');
  const hasBadge = unit.type === 'snippet';
  const hasQuote = !!unit.quote;

  return (
    <button
      type="button"
      className={`bleed-card${isImage ? ' bleed-card--image' : ''}${unit.type === 'password' ? ' bleed-card--pw' : ''}${isFile ? ' bleed-card--file' : ''}${hasQuote ? ' bleed-card--quoted' : ''}`}
      onClick={onClick}
      aria-label={`Open unit ${unit.id}`}
    >
      {hasBadge && <span className="bleed-card__badge"><BadgeIcon /></span>}

      {isImage && (
        <div className="bleed-card__media">
          <img src={unit.content} alt={unit.fileName} className="bleed-card__img" />
        </div>
      )}

      {unit.type === 'snippet' && (
        <>
          <p className="bleed-card__text"><Linkify>{unit.content}</Linkify></p>
          <LinkPreview text={unit.content} />
        </>
      )}

      {unit.type === 'password' && (
        <div className="bleed-card__pw">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          <span className="bleed-card__pw-mask">{'•'.repeat(Math.min(unit.content.length, 10))}</span>
        </div>
      )}

      {isFile && (
        <div className="bleed-card__file-body">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
          <span className="bleed-card__file-name">{unit.fileName}</span>
        </div>
      )}

      {hasQuote && (
        <div className="bleed-card__footer">
          <p className="bleed-card__quote">{unit.quote}</p>
        </div>
      )}

      <span className="bleed-card__date">{relativeDate(unit.createdAt)}</span>
    </button>
  );
}

export default function Carousel({ title, units, onUnitClick, onAddClick }) {
  if (!units?.length) return null;
  return (
    <div className="carousel">
      <div className="carousel__header">
        <h2 className="carousel__title">{title}</h2>
        {onAddClick && (
          <button type="button" className="carousel__add-btn" onClick={onAddClick} aria-label="Add">
            +
          </button>
        )}
      </div>
      <div className="carousel__row">
        {units.map((unit, i) => (
          <CarouselCard key={unit.id} unit={unit} onClick={() => onUnitClick(unit, units, i)} />
        ))}
      </div>
    </div>
  );
}
