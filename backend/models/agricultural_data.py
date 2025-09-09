import pandas as pd
import json
import random

# -----------------------------
# Hardcoded Soil Dataset (>10 states)
# -----------------------------
soil_data = [
    {"State": "Maharashtra", "Soil_Type": "Black cotton soil", "Major_Crops": "Cotton, Sugarcane, Soybean, Jowar"},
    {"State": "Punjab", "Soil_Type": "Alluvial soil", "Major_Crops": "Wheat, Rice, Maize, Sugarcane"},
    {"State": "Kerala", "Soil_Type": "Laterite soil", "Major_Crops": "Rice, Coconut, Rubber, Spices"},
    {"State": "Gujarat", "Soil_Type": "Black soil", "Major_Crops": "Cotton, Groundnut, Wheat, Rice"},
    {"State": "Tamil Nadu", "Soil_Type": "Red loamy soil", "Major_Crops": "Rice, Sugarcane, Cotton, Millets"},
    {"State": "Andhra Pradesh", "Soil_Type": "Alluvial soil", "Major_Crops": "Rice, Tobacco, Groundnut, Cotton"},
    {"State": "Uttar Pradesh", "Soil_Type": "Alluvial soil", "Major_Crops": "Sugarcane, Wheat, Rice, Pulses"},
    {"State": "Rajasthan", "Soil_Type": "Desert soil", "Major_Crops": "Bajra, Barley, Mustard, Gram"},
    {"State": "Madhya Pradesh", "Soil_Type": "Black cotton soil", "Major_Crops": "Soybean, Wheat, Gram, Rice"},
    {"State": "Haryana", "Soil_Type": "Alluvial soil", "Major_Crops": "Wheat, Rice, Cotton, Sugarcane"},
    {"State": "Bihar", "Soil_Type": "Alluvial soil", "Major_Crops": "Maize, Wheat, Rice, Pulses"},
    {"State": "West Bengal", "Soil_Type": "Alluvial soil", "Major_Crops": "Rice, Jute, Tea, Sugarcane"}
]
soil_df = pd.DataFrame(soil_data)

# -----------------------------
# Load Crop Production Dataset
# -----------------------------
crop_df = pd.read_csv("../data/crop_production.csv")

# -----------------------------
# Static Knowledge Sources
# -----------------------------
weather_advice = {
    "sunny": "Good time for harvesting and drying crops. Ensure irrigation for crops sensitive to heat.",
    "rainy": "Best for rice and sugarcane. Avoid harvesting and apply drainage if waterlogging occurs.",
    "cloudy": "Suitable for transplanting seedlings. Monitor fungal diseases.",
    "hot": "Ensure irrigation, use mulching to retain soil moisture, and consider heat-tolerant crops.",
    "cold": "Protect seedlings with covers, use frost-resistant crops, and irrigate lightly at night to prevent frost damage."
}

pest_advice = {
    "cotton": {
        "bollworm": "Use pheromone traps, neem sprays, and BT-cotton varieties.",
        "aphids": "Spray neem oil or systemic insecticides; encourage ladybird beetles."
    },
    "rice": {
        "stem borer": "Flood the field intermittently and use Trichogramma egg parasitoids.",
        "brown planthopper": "Avoid excessive nitrogen and apply imidacloprid if infestation is high."
    },
    "wheat": {
        "rust": "Grow rust-resistant varieties and spray propiconazole fungicide if needed."
    }
}

fertilizer_advice = {
    "cotton": "Apply 100-120 kg N, 50-60 kg P2O5, and 40-50 kg K2O per hectare.",
    "rice": "Apply nitrogen in 3 splits: 40% basal, 30% tillering, 30% panicle initiation.",
    "wheat": "Apply 120 kg N, 60 kg P2O5, and 40 kg K2O per hectare.",
    "sugarcane": "Apply 250 kg N, 100 kg P2O5, and 120 kg K2O per hectare."
}

subsidy_info = {
    "PM-Kisan": "Direct income support of ₹6,000 per year for farmer families.",
    "PMFBY": "Crop insurance scheme covering yield losses due to natural calamities.",
    "Soil Health Card": "Provides soil testing and fertilizer recommendations to farmers.",
    "PM-KUSUM": "Subsidy for installing solar pumps for irrigation.",
    "E-NAM": "Electronic National Agriculture Market helps farmers sell produce at better prices."
}

market_prices = {
    "cotton": "₹6,800 per quintal (MSP)",
    "wheat": "₹2,275 per quintal (MSP)",
    "rice": "₹2,300 per quintal (common variety MSP)",
    "sugarcane": "₹315 per quintal (FRP fixed by government)",
    "soybean": "₹4,300 per quintal (MSP)"
}

# -----------------------------
# Helper Functions to Generate Q&A
# -----------------------------
def generate_soil_questions(row):
    state = row["State"]
    soil_type = row["Soil_Type"]
    crops = row["Major_Crops"].split(",") if isinstance(row["Major_Crops"], str) else []

    questions = []
    if crops:
        q1 = f"What crops are suitable for {soil_type.lower()} in {state}?"
        a1 = f"In {state}, {soil_type.lower()} is best suited for growing {', '.join(crops)}."
        questions.append({"input": q1, "output": a1})

        q2 = f"I am a farmer in {state}. Which crops should I grow in {soil_type.lower()} soil?"
        a2 = f"You can grow {', '.join(crops)} in {soil_type.lower()} soil in {state}."
        questions.append({"input": q2, "output": a2})

    return questions


def generate_production_questions(row):
    state = row["State_Name"]
    crop = row["Crop"]
    production = row.get("Production", None)

    questions = []
    if pd.notna(production) and production > 0:
        q1 = f"Which state produces the most {crop.lower()} in India?"
        a1 = f"{state} produces one of the highest amounts of {crop.lower()} in India with {production} tonnes."
        questions.append({"input": q1, "output": a1})

        q2 = f"How much {crop.lower()} is produced in {state}?"
        a2 = f"In {state}, the production of {crop.lower()} is about {production} tonnes."
        questions.append({"input": q2, "output": a2})

    return questions


def generate_weather_questions():
    questions = []
    for condition, advice in weather_advice.items():
        q1 = f"What should farmers do during {condition} weather?"
        a1 = advice
        questions.append({"input": q1, "output": a1})

        q2 = f"As a farmer, how does {condition} weather affect crops?"
        a2 = advice
        questions.append({"input": q2, "output": a2})
    return questions


def generate_pest_questions():
    questions = []
    for crop, pests in pest_advice.items():
        for pest, advice in pests.items():
            q1 = f"How can farmers control {pest} in {crop}?"
            a1 = advice
            questions.append({"input": q1, "output": a1})

            q2 = f"What is the best way to manage {pest} when growing {crop}?"
            a2 = advice
            questions.append({"input": q2, "output": a2})
    return questions


def generate_fertilizer_questions():
    questions = []
    for crop, advice in fertilizer_advice.items():
        q1 = f"What is the recommended fertilizer schedule for {crop}?"
        questions.append({"input": q1, "output": advice})

        q2 = f"How much fertilizer should I apply for {crop} cultivation?"
        questions.append({"input": q2, "output": advice})
    return questions


def generate_subsidy_questions():
    questions = []
    for scheme, desc in subsidy_info.items():
        q1 = f"What is the {scheme} scheme for farmers?"
        questions.append({"input": q1, "output": desc})

        q2 = f"Can farmers get benefits from {scheme}?"
        questions.append({"input": q2, "output": desc})
    return questions


def generate_market_questions():
    questions = []
    for crop, price in market_prices.items():
        q1 = f"What is the current MSP of {crop}?"
        questions.append({"input": q1, "output": price})

        q2 = f"How much does {crop} sell for in the market?"
        questions.append({"input": q2, "output": price})
    return questions


# -----------------------------
# Generate Q&A Pairs
# -----------------------------
qa_pairs = []

# From soil dataset
for _, row in soil_df.iterrows():
    qa_pairs.extend(generate_soil_questions(row))

# From crop production dataset
for _, row in crop_df.iterrows():
    qa_pairs.extend(generate_production_questions(row))

# Add knowledge-based Q&A
qa_pairs.extend(generate_weather_questions())
qa_pairs.extend(generate_pest_questions())
qa_pairs.extend(generate_fertilizer_questions())
qa_pairs.extend(generate_subsidy_questions())
qa_pairs.extend(generate_market_questions())

# Shuffle dataset for variety
random.shuffle(qa_pairs)

# -----------------------------
# Save to JSONL
# -----------------------------
output_file = "farmer_qa_dataset.jsonl"
with open(output_file, "w", encoding="utf-8") as f:
    for item in qa_pairs:
        f.write(json.dumps(item, ensure_ascii=False) + "\n")

print(f"✅ Generated {len(qa_pairs)} Q&A pairs and saved to {output_file}")
