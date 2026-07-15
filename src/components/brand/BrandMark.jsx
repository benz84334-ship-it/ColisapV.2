export default function BrandMark({ alt = 'Colisap Monitoring logo', className = 'h-11 w-11' }) {
  return (
    <img
      alt={alt}
      className={`${className} shrink-0 rounded-lg bg-white object-contain p-1 shadow-sm`}
      height="44"
      src="/colisap-logo.png"
      width="44"
    />
  );
}
