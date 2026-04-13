import { useLongPress } from '../hooks/useLongPress';
import { CheckIcon, LockTypeIcon } from './Icons';
import Linkify from './Linkify';
import LinkPreview from './LinkPreview';
import { MISC_ID } from '../utils/carouselGroups';
import { isEncryptedContent } from '../utils/crypto';

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
  const diffMs = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1)  return 'now';
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d`;
  if (days < 365) return `${Math.floor(days / 30)}mo`;
  return `${Math.floor(days / 365)}y`;
}

export function CarouselCard({ unit, onClick, selected = false, onLongPress, categoryLabel = null }) {
  const pressHandlers = useLongPress({ onClick, onLongPress });

  const isLocked = unit.encrypted && isEncryptedContent(unit.content);
  const isImage  = !isLocked && unit.type === 'image' && unit.mimeType?.startsWith('image/');
  const isFile   = !isLocked && unit.type === 'image' && !unit.mimeType?.startsWith('image/');
  const hasBadge = !isLocked && unit.type === 'snippet';
  const hasQuote = !!unit.quote;
  const noteOnly = !isLocked && !unit.content && hasQuote;

  return (
    <button
      type="button"
      className={[
        'bleed-card',
        isImage  && 'bleed-card--image',
        isFile   && 'bleed-card--file',
        noteOnly ? 'bleed-card--note-only' : hasQuote && 'bleed-card--quoted',
        selected && 'bleed-card--selected',
      ].filter(Boolean).join(' ')}
      {...pressHandlers}
      aria-label={`Open unit ${unit.id}`}
    >
      {selected && (
        <span className="bleed-card__check">
          <CheckIcon size={11} />
        </span>
      )}

      {/* Encrypted — show lock badge and masked body */}
      {isLocked && (
        <>
          <span className="bleed-card__badge bleed-card__badge--lock">
            <LockTypeIcon />
          </span>
          <div className="bleed-card__locked">
            <span className="bleed-card__locked-dots">{'•'.repeat(12)}</span>
          </div>
        </>
      )}

      {/* Badge — hidden for note-only and locked cards */}
      {!noteOnly && !isLocked && hasBadge && <span className="bleed-card__badge"><BadgeIcon /></span>}

      {/* Regular content — hidden when note is the only thing or locked */}
      {!noteOnly && !isLocked && isImage && (
        <div className="bleed-card__media">
          <img src={unit.content} alt={unit.fileName} className="bleed-card__img" />
        </div>
      )}

      {!noteOnly && !isLocked && unit.type === 'snippet' && (
        <>
          <p className="bleed-card__text"><Linkify>{unit.content}</Linkify></p>
          <LinkPreview text={unit.content} />
        </>
      )}

      {!noteOnly && !isLocked && isFile && (
        <div className="bleed-card__file-body">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
          <span className="bleed-card__file-name">{unit.fileName}</span>
        </div>
      )}

      {noteOnly ? (
        <p className="bleed-card__note-main">{unit.quote}</p>
      ) : (
        !isLocked && hasQuote && (
          <div className="bleed-card__footer">
            <p className="bleed-card__quote">{unit.quote}</p>
          </div>
        )
      )}

      <div className="bleed-card__bottom">
        <span className="bleed-card__date">{relativeDate(unit.createdAt)}</span>
        {categoryLabel && <span className="bleed-card__cat-chip">{categoryLabel}</span>}
      </div>
    </button>
  );
}

// selected: Set<id> — which card IDs are currently selected
// onCardLongPress: (unit) => void — called when a card is long-pressed
// groups: { id, title }[] | null — pass storedGroups to show category chips on cards
export default function Carousel({ title, units, onUnitClick, onAddClick, selected, onCardLongPress, groups = null }) {
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
        {units.map((unit, i) => {
          const categoryLabel = groups && unit.categoryId && unit.categoryId !== MISC_ID
            ? (groups.find((g) => g.id === unit.categoryId)?.title ?? null)
            : null;
          return (
            <CarouselCard
              key={unit.id}
              unit={unit}
              onClick={() => onUnitClick(unit, units, i)}
              selected={selected?.has(unit.id) ?? false}
              onLongPress={onCardLongPress ? () => onCardLongPress(unit) : undefined}
              categoryLabel={categoryLabel}
            />
          );
        })}
      </div>
    </div>
  );
}
