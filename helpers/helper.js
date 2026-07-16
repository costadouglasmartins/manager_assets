function getRandomInt(max)
  {
    return Math.floor(Math.random() * max);
  }

function onlyDigits(value)
  {
    return String(value || "").replace(/\D/g, "");
  }

function areAllCharsEqual(value)
  {
    return /^([A-Z0-9])\1+$/.test(value);
  }

function calculateMod11Digit(sum)
  {
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  }

function calculateCpfDigit(cpfDigits, factorStart)
  {
    let sum = 0;
    for (let i = 0; i < cpfDigits.length; i += 1)
      {
        sum += Number(cpfDigits[i]) * (factorStart - i);
      }
    return calculateMod11Digit(sum);
  }

function generateCpf(formatted = false)
  {
    let base = "";
    for (let i = 0; i < 9; i += 1)
      {
        base += getRandomInt(10);
      }

    const digit1 = calculateCpfDigit(base, 10);
    const digit2 = calculateCpfDigit(base + digit1, 11);
    const cpf = base + String(digit1) + String(digit2);

    if (!formatted)
      {
        return cpf;
      }

    return cpf
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d{2})$/, "$1-$2");
  }

function validateCpf(value)
  {
    const cpf = onlyDigits(value);
    if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf))
      {
        return false;
      }

    const digit1 = calculateCpfDigit(cpf.slice(0, 9), 10);
    const digit2 = calculateCpfDigit(cpf.slice(0, 9) + String(digit1), 11);

    return cpf === cpf.slice(0, 9) + String(digit1) + String(digit2);
  }

function calculateCnpjDigit(baseDigits, weights)
  {
    let sum = 0;
    for (let i = 0; i < baseDigits.length; i += 1)
      {
        sum += Number(baseDigits[i]) * weights[i];
      }
    return calculateMod11Digit(sum);
  }

function generateCnpj(formatted = false)
  {
    let base = "";
    for (let i = 0; i < 8; i += 1)
      {
        base += getRandomInt(10);
      }
    base += "0001";

    const digit1 = calculateCnpjDigit(base, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
    const digit2 = calculateCnpjDigit(base + digit1, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
    const cnpj = base + String(digit1) + String(digit2);

    if (!formatted)
      {
        return cnpj;
      }

    return cnpj
      .replace(/(\d{2})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1/$2")
      .replace(/(\d{4})(\d{2})$/, "$1-$2");
  }

function validateCnpj(value)
  {
    const cnpj = onlyDigits(value);
    if (cnpj.length !== 14 || /^(\d)\1+$/.test(cnpj))
      {
        return false;
      }

    const base = cnpj.slice(0, 12);
    const digit1 = calculateCnpjDigit(base, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
    const digit2 = calculateCnpjDigit(base + String(digit1), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);

    return cnpj === base + String(digit1) + String(digit2);
  }

function randomAlphanumericChar()
  {
    const chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    return chars[getRandomInt(chars.length)];
  }

function charToBase36Value(char)
  {
    if (/[0-9]/.test(char))
      {
        return Number(char);
      }
    return char.charCodeAt(0) - 48;
  }

function calculateCnpjAlphanumericDigit(baseChars, weights)
  {
    let sum = 0;
    for (let i = 0; i < baseChars.length; i += 1)
      {
        sum += charToBase36Value(baseChars[i]) * weights[i];
      }
    return calculateMod11Digit(sum);
  }

function generateCnpjAlphanumeric(formatted = false)
  {
    let base = "";
    for (let i = 0; i < 12; i += 1)
      {
        base += randomAlphanumericChar();
      }

    if (areAllCharsEqual(base))
      {
        base = "A1B2C3D4E5F6";
      }

    const digit1 = calculateCnpjAlphanumericDigit(base, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
    const digit2 = calculateCnpjAlphanumericDigit(base + String(digit1), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
    const cnpj = base + String(digit1) + String(digit2);

    if (!formatted)
      {
        return cnpj;
      }

    return cnpj
      .replace(/(.{2})(.{3})(.{3})(.{4})(.{2})/, "$1.$2.$3/$4-$5");
  }

function validateCnpjAlphanumeric(value)
  {
    const cnpj = String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (cnpj.length !== 14 || !/^[A-Z0-9]{12}\d{2}$/.test(cnpj) || areAllCharsEqual(cnpj))
      {
        return false;
      }

    const base = cnpj.slice(0, 12);
    const digit1 = calculateCnpjAlphanumericDigit(base, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
    const digit2 = calculateCnpjAlphanumericDigit(base + String(digit1), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);

    return cnpj === base + String(digit1) + String(digit2);
  }

(function (window, document) {
  "use strict";

  const validThemes = ["light", "dark"];

  function readTheme(storageKey)
    {
    try
      {
      const theme = window.localStorage.getItem(storageKey);
      return validThemes.includes(theme) ? theme : "light";
      }
    catch (error)
      {
      return "light";
      }
    }

  function saveTheme(storageKey, theme)
    {
    try
      {
      window.localStorage.setItem(storageKey, theme);
      }
    catch (error)
      {
      // localStorage may be unavailable due to browser privacy settings.
      }
    }

  function updateThemeButton(themeButton, theme)
    {
    const themeIcon = themeButton.querySelector("i");
    const isDarkTheme = theme === "dark";
    const label = isDarkTheme ? "Alternar para tema claro" : "Alternar para tema escuro";

    if (themeIcon)
      {
      themeIcon.className = isDarkTheme ? "bi bi-sun-fill" : "bi bi-moon-fill";
      }

    themeButton.setAttribute("aria-label", label);
    themeButton.setAttribute("title", label);
    }

  function initializeTheme(options)
    {
    const storageKey = options.storageKey;
    const root = document.documentElement;
    const savedTheme = readTheme(storageKey);

    root.setAttribute("data-bs-theme", savedTheme);

    document.addEventListener("DOMContentLoaded", function () {
      const themeButton = document.getElementById(options.buttonId || "themeToggle");

      if (!themeButton)
        {
        return;
        }

      updateThemeButton(themeButton, savedTheme);

      themeButton.addEventListener("click", function () {
        const theme = root.getAttribute("data-bs-theme") === "dark" ? "light" : "dark";

        root.setAttribute("data-bs-theme", theme);
        saveTheme(storageKey, theme);
        updateThemeButton(themeButton, theme);
      });
    });
    }

  window.AppTheme = {
    initialize: initializeTheme
  };
})(window, document);

function isValidDatePtBr(value) 
  {
    const digits = String(value).replace(/\D/g, "");
    if (digits.length !== 8) return false; // exige DDMMYYYY completo

    const day = Number(digits.slice(0, 2));
    const month = Number(digits.slice(2, 4));
    const year = Number(digits.slice(4, 8));

    if (year < 1000 || year > 9999) return false;
    if (month < 1 || month > 12) return false;

    const isLeapYear = (y) => (y % 4 === 0 && y % 100 !== 0) || (y % 400 === 0);

    const daysInMonth = (m, y) => {
      if (m === 2) return isLeapYear(y) ? 29 : 28;
      if ([4, 6, 9, 11].includes(m)) return 30;
      return 31;
    };

    const maxDay = daysInMonth(month, year);
    return day >= 1 && day <= maxDay;
  }
