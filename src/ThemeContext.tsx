import React, { createContext, useState, useContext, useEffect } from 'react';

interface ThemeContextType {
  theme: string;
  setTheme: (theme: string) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, rawSetTheme] = useState(() => {
    const storedTheme = localStorage.getItem('uywng-machka-theme');
    return storedTheme || 'brite'; // default theme
  });

  const setTheme = (newTheme: string) => {
    rawSetTheme(newTheme);
    localStorage.setItem('uywng-machka-theme', newTheme);
  };

  useEffect(() => {
    const storedTheme = localStorage.getItem('uywng-machka-theme');
    if (storedTheme) {
      rawSetTheme(storedTheme);
    }
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};