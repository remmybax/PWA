"use client";

/** A submit button that asks first. */
export function ConfirmButton({ message, className, children, style }: { message: string; className?: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <button
      className={className}
      style={style}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
