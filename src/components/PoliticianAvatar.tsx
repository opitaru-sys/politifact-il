export function PoliticianAvatar({
  id,
  name,
  image,
  size = "md",
}: {
  id: string;
  name: string;
  image?: string | null;
  size?: "sm" | "md" | "lg";
}) {
  const sizeClasses = {
    sm: "w-8 h-8 text-sm",
    md: "w-10 h-10 text-lg",
    lg: "w-20 h-20 text-3xl",
  };

  const src = image || `/politicians/${id}.jpg`;

  return (
    <img
      src={src}
      alt={name}
      className={`${sizeClasses[size]} rounded-full object-cover bg-gray-200 shrink-0`}
    />
  );
}
