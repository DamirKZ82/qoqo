import re

# Транслитерация кириллицы для человекочитаемых адресов новостей.
TRANSLIT = {
    "а": "a",
    "б": "b",
    "в": "v",
    "г": "g",
    "д": "d",
    "е": "e",
    "ё": "e",
    "ж": "zh",
    "з": "z",
    "и": "i",
    "й": "y",
    "к": "k",
    "л": "l",
    "м": "m",
    "н": "n",
    "о": "o",
    "п": "p",
    "р": "r",
    "с": "s",
    "т": "t",
    "у": "u",
    "ф": "f",
    "х": "h",
    "ц": "ts",
    "ч": "ch",
    "ш": "sh",
    "щ": "sch",
    "ъ": "",
    "ы": "y",
    "ь": "",
    "э": "e",
    "ю": "yu",
    "я": "ya",
    "ә": "a",
    "ғ": "g",
    "қ": "q",
    "ң": "n",
    "ө": "o",
    "ұ": "u",
    "ү": "u",
    "һ": "h",
    "і": "i",
}


def slugify(value: str, *, max_length: int = 200) -> str:
    text = value.strip().lower()
    text = "".join(TRANSLIT.get(char, char) for char in text)
    text = re.sub(r"[^a-z0-9]+", "-", text).strip("-")
    return text[:max_length] or "post"
