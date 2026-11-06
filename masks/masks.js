function applyMaskedValue(el, maskCallback)
  {
  const pos = el.selectionStart;
  const prev = el.value;
  el.value = maskCallback(el.value);
  const diff = el.value.length - prev.length;
  const nextPos = Math.max(0, (pos || el.value.length) + diff);
  el.setSelectionRange(nextPos, nextPos);
  }

/**
 * Applies input masks based on CSS helper classes using event delegation.
 * This supports static and dynamically inserted fields.
 */
document.addEventListener("input", function (e)
  {
    // Mask for CEPs
  if (e.target && e.target.classList.contains("mask-cep"))
    {
    applyMaskedValue(e.target, applyCepMask);
    }
    
  // Mask for CPF/CNPJ
  if (e.target && e.target.classList.contains("mask-cpf-cnpj"))
    {
    applyMaskedValue(e.target, applyCpfCnpjMask);
    }

  // Mask for phone numbers
  if (e.target && (e.target.classList.contains("mask-phone") || e.target.classList.contains("mask-phone-intl")))
    {
    applyMaskedValue(e.target, applyPhoneMask);
    }

  // Mask for CEPs
  if (e.target && e.target.classList.contains("mask-cep"))
    {
    applyMaskedValue(e.target, applyCepMask);
    }

  // Mask for dates in DD/MM/YYYY format
  if (e.target && e.target.classList.contains("mask-date"))
    {
    applyMaskedValue(e.target, applyDatePtBrMask);
    }

  // Mask for Brazilian currency amounts (e.g. 1.234,56), caret kept at the end
  if (e.target && e.target.classList.contains("mask-money-br"))
    {
    const maskedMoney = applyMoneyBrMask(e.target.value);
    // Deleting the last digits of a zero amount clears the field instead of leaving "0,00" stuck.
    const isDeleting = typeof e.inputType === "string" && e.inputType.indexOf("delete") === 0;
    e.target.value = (isDeleting && maskedMoney === "0,00") ? "" : maskedMoney;
    }
  });

/**
 * Applies masks to fields that already have values when the page loads.
 */
document.addEventListener("DOMContentLoaded", function ()
  {
  document.querySelectorAll(".mask-cep").forEach(function (el)
    {
    el.value = applyCepMask(el.value);
    });

  document.querySelectorAll(".mask-cpf-cnpj").forEach(function (el)
    {
    el.value = applyCpfCnpjMask(el.value);
    });

  document.querySelectorAll(".mask-phone, .mask-phone-intl").forEach(function (el)
    {
    el.value = applyPhoneMask(el.value);
    });

  document.querySelectorAll(".mask-date").forEach(function (el)
    {
    el.value = applyDatePtBrMask(el.value);
    });

  document.querySelectorAll(".mask-money-br").forEach(function (el)
    {
    el.value = applyMoneyBrMask(el.value);
    });
  });

/**
 * Formats a CEP value as `99999-999`.
 *
 * @param {string} value
 * @returns {string}
 */
function applyCepMask(value)
  {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  return digits.replace(/(\d{5})(\d{1,3})$/, "$1-$2");
  }


/**
 * Formats CPF/CNPJ values.
 * - CPF (numeric up to 11 digits): `999.999.999-99`
 * - CNPJ numeric/alphanumeric (up to 14 chars): `99.999.999/9999-99`
 *
 * @param {string} value
 * @returns {string}
 */
function applyCpfCnpjMask(value)
  {
  const normalized = String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 14);
  const numericOnly = normalized.replace(/\D/g, "");

  if (/^\d+$/.test(normalized) && normalized.length <= 11)
    {
    return numericOnly
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
    }

  return normalized
      .replace(/^(.{2})(.{0,3})(.{0,3})(.{0,4})(.{0,2}).*$/, function (_, p1, p2, p3, p4, p5)
        {
          let result = p1;
          if (p2)
            {
              result += "." + p2;
            }
          if (p3)
            {
              result += "." + p3;
            }
          if (p4)
            {
              result += "/" + p4;
            }
          if (p5)
            {
              result += "-" + p5;
            }
          return result;
        });
  }

/**
 * Formats phone values as `+CC(AA)NNNNN-NNNN`.
 * The country code length is inferred from the amount of typed digits.
 *
 * @param {string} value
 * @returns {string}
 */
function applyPhoneMask(value)
  {
  const raw = String(value || "");
  const trimmed = raw.trim();

  if (trimmed === "")
    {
    return "";
    }

  const hasExplicitPlus = raw.trim().startsWith("+");
  const digits = raw.replace(/\D/g, "").slice(0, 14);

  if (hasExplicitPlus && digits.length === 0)
    {
    return "+";
    }

  if (!digits || /^[+\-()\s]+$/.test(trimmed))
    {
    return "";
    }

  let countryCode = "";
  let nationalNumber = "";

  if (hasExplicitPlus)
    {
    if (/^[17]/.test(digits))
      {
      countryCode = digits.slice(0, 1);
      nationalNumber = digits.slice(1, 12);
      }
    else
      {
      const currentCountryMatch = raw.match(/^\s*\+(\d{1,3})\(/);
      if (currentCountryMatch)
        {
        countryCode = currentCountryMatch[1];
        nationalNumber = raw.slice(currentCountryMatch[0].length).replace(/\D/g, "").slice(0, 11);
        }
      else
        {
        const countryLength = digits.length <= 3 ? digits.length : (digits.length > 13 ? 3 : 2);
        countryCode = digits.slice(0, countryLength);
        nationalNumber = digits.slice(countryLength, countryLength + 11);
        }
      }
    }
  else
    {
    nationalNumber = digits.slice(0, 11);
    }

  const areaCode = nationalNumber.slice(0, 2);
  const subscriber = nationalNumber.slice(2);
  let formatted = countryCode ? "+" + countryCode : "";

  if (areaCode)
    {
    formatted += "(" + areaCode;
    if (areaCode.length === 2 && subscriber)
      {
      formatted += ")";
      }
    }

  if (subscriber)
    {
    const firstPartLength = subscriber.length > 8 ? 5 : 4;
    const firstPart = subscriber.slice(0, firstPartLength);
    const secondPart = subscriber.slice(firstPartLength, firstPartLength + 4);

    formatted += firstPart;
    if (secondPart)
      {
      formatted += "-" + secondPart;
      }
    }

  return formatted;
  }


function applyDatePtBrMask(value) 
  {
  const digits = String(value).replace(/\D/g, "").slice(0, 8); // DDMMYYYY
  const pattern = "##/##/####";

  let out = "";
  let di = 0;

  for (let i = 0; i < pattern.length && di < digits.length; i++) 
    {
    const p = pattern[i];
    if (p === "#") out += digits[di++];
    else out += p;
    }

  return out;
  }

/**
 * Formats a typed value as a Brazilian currency amount without symbol, filling
 * cents from the right (`5` -> `0,05`, `123456` -> `1.234,56`).
 * Only an empty value (no digits) returns an empty string; an explicit zero is kept as `0,00`.
 * Initial values must already be formatted as `1.234,56` (digits-only input is
 * read as cents).
 *
 * @param {string} value
 * @returns {string}
 */
function applyMoneyBrMask(value)
  {
  const digits = String(value || "").replace(/\D/g, "").slice(0, 12);

  // Only an empty value (no digits) stays empty; an explicit zero is a valid amount shown as 0,00.
  if (digits === "")
    {
    return "";
    }

  const padded = digits.padStart(3, "0");
  const cents = padded.slice(-2);
  const integerPart = padded.slice(0, -2).replace(/^0+(?=\d)/, "").replace(/\B(?=(\d{3})+(?!\d))/g, ".");

  return integerPart + "," + cents;
  }
