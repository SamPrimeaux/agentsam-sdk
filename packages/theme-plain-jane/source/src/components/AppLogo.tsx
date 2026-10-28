interface AppLogoProps {
  className?: string;
  size?: number;
  showText?: boolean;
}

/**
 * Editorial Logo for Plain Jane Journal
 * Renders the vector asset registered in cms_assets
 */
export function AppLogo({ className = "", size = 28, showText = false }: AppLogoProps) {
  return (
    <div className={`inline-flex items-center gap-2.5 select-none ${className}`}>
      <img
        src={import.meta.env.BASE_URL + "icons/app-logo.svg"}
        alt="Plain Jane Journal"
        width={size}
        height={size}
        className="shrink-0 transition-transform duration-300 hover:rotate-3"
      />
      {showText && (
        <span className="font-serif text-lg font-semibold tracking-wider text-ink uppercase">
          Plain Jane
        </span>
      )}
    </div>
  );
}
