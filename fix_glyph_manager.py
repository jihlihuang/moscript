import re

with open("components/PersonalGlyphManager.tsx", "r") as f:
    content = f.read()

content = content.replace('rounded-2xl', 'rounded-sm')
content = content.replace('rounded-xl', 'rounded-sm')
content = content.replace('bg-stone-50', 'bg-[#fdfbf7]')

with open("components/PersonalGlyphManager.tsx", "w") as f:
    f.write(content)

print("Updated PersonalGlyphManager.tsx")
