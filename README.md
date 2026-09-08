# Split the Bill From a Photograph

A bill-splitting application that takes photographs of a restaurant bill, extracts bill details using OCR, allows the user to review and correct the extracted information, and then calculates how much each person owes.

## Features

* Upload 1–4 photographs of a restaurant bill.
* Extract bill line items and amounts using local OCR.
* Support multiple bill photographs.
* Validate structured bill data using Pydantic on the FastAPI backend.
* Review and correct OCR results before performing calculations.
* Add 2–7 people to the bill.
* Assign each item to one person, multiple people, or everyone.
* Split shared items equally among the people assigned to that item.
* Distribute tax and service charges proportionally based on what each person consumed.
* Include discounts in the final calculation.
* Flag mismatches between the calculated total and the printed bill total.
* Display a detailed amount owed by each person.

## Tech Stack

### Frontend

* React
* JavaScript
* CSS
* Lucide React

### Backend

* Python
* FastAPI
* Pydantic
* Tesseract OCR
* Pillow


## How to Run

### Prerequisites

Make sure the following are installed:

* Node.js and npm
* Python 3.x
* Tesseract OCR

### 1. Clone the repository

```bash
git clone https://github.com/AnayDesai-sketch/Bill-Splitter.git
cd Bill-Splitter
```

### 2. Run the Backend

Open a terminal in the backend directory:

```bash
cd backend
```

Create and activate a virtual environment:

**Windows:**

```bash
python -m venv venv
venv\Scripts\activate
```

Install the Python dependencies:

```bash
pip install -r requirements.txt
```

Start the FastAPI server:

```bash
uvicorn main:app --reload
```

The backend will run locally using FastAPI's development server.

### 3. Run the Frontend

Open another terminal and navigate to the frontend directory:

```bash
cd frontend
```

Install dependencies:

```bash
npm install
```

Start the React development server:

```bash
npm start
```

The application will open in your browser.

## How It Works

1. Upload photographs of a restaurant bill.
2. The backend processes the images using Tesseract OCR.
3. Extracted items and amounts are returned as structured data.
4. The user reviews and corrects the OCR results if necessary.
5. The user adds the people who are splitting the bill.
6. Each item is assigned to the appropriate person or people.
7. Shared items are divided equally among the assigned people.
8. Tax and service charges are distributed proportionally.
9. Discounts are applied to the calculation.
10. The application calculates and displays the final amount owed by each person.

