import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  icon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({ 
  children, 
  variant = 'primary', 
  size = 'md', 
  icon, 
  className = '',
  ...props 
}) => {
  const baseStyles = "relative inline-flex items-center justify-center font-bold uppercase tracking-wider transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden group";
  
  const variants = {
    primary: "bg-nexus-accent text-black hover:bg-white hover:text-black border border-nexus-accent hover:border-white",
    secondary: "bg-nexus-800 text-white hover:bg-nexus-700 border border-nexus-700",
    danger: "bg-red-900/20 text-red-500 hover:bg-red-600 hover:text-white border border-red-900/50",
    ghost: "bg-transparent text-nexus-dim hover:text-nexus-accent hover:bg-white/5"
  };

  const sizes = {
    sm: "text-[10px] px-3 py-1.5 rounded gap-1.5",
    md: "text-xs px-5 py-2.5 rounded-md gap-2",
    lg: "text-sm px-6 py-3 rounded-md gap-3"
  };

  return (
    <button 
      className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {icon && <span className="relative z-10">{icon}</span>}
      <span className="relative z-10">{children}</span>
    </button>
  );
};