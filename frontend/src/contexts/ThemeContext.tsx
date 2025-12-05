import React, { createContext, useContext, useState, useEffect } from 'react';

type ThemeMode = 'light' | 'dark' | 'system';
type ResolvedTheme = 'light' | 'dark';

interface ThemeContextType {
  theme: ResolvedTheme;
  themeMode: ThemeMode;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

const THEME_STORAGE_KEY = 'theme-mode';

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // 获取系统主题偏好
  const getSystemTheme = (): ResolvedTheme => {
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
    return 'light';
  };

  // 初始化主题模式：从 localStorage 读取用户手动设置的主题，如果没有则默认为 'system'
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return (stored as ThemeMode) || 'system';
  });

  // 解析后的主题（实际应用的主题）
  const [theme, setTheme] = useState<ResolvedTheme>(() => {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') {
      return stored;
    }
    return getSystemTheme();
  });

  useEffect(() => {
    // 监听系统主题变化
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent) => {
      // 只有在 themeMode 为 'system' 时才响应系统主题变化
      if (themeMode === 'system') {
        setTheme(e.matches ? 'dark' : 'light');
      }
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [themeMode]);

  useEffect(() => {
    // 应用主题到 document
    const root = document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(theme);
    root.setAttribute('data-theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    // 切换顺序：light -> dark -> light (简化版，用户可以手动切换)
    let newThemeMode: ThemeMode;
    let newTheme: ResolvedTheme;

    if (theme === 'light') {
      // 从浅色切换到深色
      newThemeMode = 'dark';
      newTheme = 'dark';
    } else {
      // 从深色切换到浅色
      newThemeMode = 'light';
      newTheme = 'light';
    }

    setThemeMode(newThemeMode);
    setTheme(newTheme);

    // 写入用户手动设置到 localStorage
    localStorage.setItem(THEME_STORAGE_KEY, newThemeMode);
  };

  return (
    <ThemeContext.Provider value={{ theme, themeMode, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};
