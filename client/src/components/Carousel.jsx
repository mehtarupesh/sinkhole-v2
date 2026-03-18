const TYPE_LABELS = { snippet: 'text', password: 'pw', image: 'img' };

function CarouselCard({ unit, onClick }) {
  return (
    <button type="button" className="unit-card carousel-card" onClick={onClick} aria-label={`Open unit ${unit.id}`}>
      <div className="unit-card__header">
        <span className="unit-card__type">{TYPE_LABELS[unit.type] ?? unit.type}</span>
        <span className="unit-card__date">{new Date(unit.createdAt).toLocaleDateString()}</span>
      </div>

      <div className="unit-card__body">
        {unit.type === 'snippet' && (
          <p className="unit-card__text carousel-card__text">{unit.content}</p>
        )}
        {unit.type === 'password' && (
          <p className="unit-card__text unit-card__text--muted">{'•'.repeat(Math.min(unit.content.length, 12))}</p>
        )}
        {unit.type === 'image' && unit.mimeType?.startsWith('image/') && (
          <img src={unit.content} alt={unit.fileName} className="unit-card__img carousel-card__img" />
        )}
        {unit.type === 'image' && !unit.mimeType?.startsWith('image/') && (
          <p className="unit-card__text unit-card__text--muted">{unit.fileName}</p>
        )}
      </div>

      {unit.quote && (
        <p className="unit-card__quote">{unit.quote}</p>
      )}
    </button>
  );
}

export default function Carousel({ title, units, onUnitClick }) {
  if (!units?.length) return null;
  return (
    <div className="carousel">
      <h2 className="carousel__title">{title}</h2>
      <div className="carousel__row">
        {units.map((unit, i) => (
          <CarouselCard key={unit.id} unit={unit} onClick={() => onUnitClick(unit, units, i)} />
        ))}
      </div>
    </div>
  );
}
