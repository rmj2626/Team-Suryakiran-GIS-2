from flask import Flask, render_template, request, jsonify
import json
import os

app = Flask(__name__)

# Ensure the JSON file exists
if not os.path.exists('layer_config.json'):
    with open('layer_config.json', 'w') as f:
        json.dump({"layers": []}, f)

@app.route('/', methods=['GET'])
def index():
    return render_template('index.html')

@app.route('/add_layer', methods=['POST'])
def add_layer():
    new_layer = request.json

    try:
        with open('layer_config.json', 'r+') as f:
            data = json.load(f)
            data['layers'].append(new_layer)
            f.seek(0)
            json.dump(data, f, indent=2)
            f.truncate()
        return jsonify({"message": "Layer added successfully!"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True)