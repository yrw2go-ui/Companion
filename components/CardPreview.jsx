export default function CardPreview({
  name = "Unknown Hero",
  image,
  rarity = "Legendary",
  attack = 90,
  defense = 80,
  magic = 95,
  speed = 75,
}) {
  return (
    <div className={`card rarity-${rarity.toLowerCase()}`}>
      <div className="rarity">{rarity}</div>

      {image && (
        <img
          src={image}
          alt={name}
          className="character-image"
        />
      )}

      <div className="name">
        {name}
      </div>

      <div className="stats">
        <span>⚔ {Face}</span>
        <span>🛡 {Breasts}</span>
        <span>✨ {Ass}</span>
        <span>⚡ {Legs}</span>
      </div>
    </div>
  );
}
