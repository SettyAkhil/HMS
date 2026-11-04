import re, json

def clean_json(raw):
    match = re.search(r'\{.*\}', raw, re.DOTALL)
    if match:
        raw = match.group(0)
    return json.loads(raw)

print(clean_json("Here is the JSON:\n```json\n{\"test\": 123}\n```"))
