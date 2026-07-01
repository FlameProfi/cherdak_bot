import json
import re

with open('v3_index.html', 'r') as f:
    content = f.read()
    # Find the JSON spec. It's after "const __spec ="
    start_marker = 'const __spec ='
    start_index = content.find(start_marker)
    if start_index != -1:
        start_index += len(start_marker)
        # Find the end of the object. Since it's a large nested object,
        # we can try to find the next ";" that is followed by "Redoc.init"
        end_marker = '};'
        end_index = content.find(end_marker, start_index)
        if end_index != -1:
            spec_str = content[start_index:end_index+1].strip()
            try:
                spec = json.loads(spec_str)
                # Success! Now we can explore the spec.
                relevant_paths = {}
                for path, methods in spec.get('paths', {}).items():
                    if 'client' in path:
                        relevant_paths[path] = methods

                print(json.dumps(relevant_paths, indent=2, ensure_ascii=False))
            except Exception as e:
                print(f"JSON Parse Error: {e}")
                # Fallback to regex if JSON is not perfect
                print("Fallback to regex...")
                paths = re.findall(r'"(/api/v2/clients[^"]*)"', spec_str)
                for p in sorted(list(set(paths))):
                    print(p)
    else:
        print("Spec not found")
