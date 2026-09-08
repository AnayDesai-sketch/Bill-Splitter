import React, { useRef, useState } from "react";
import {
  Camera,
  Plus,
  Trash2,
  ArrowLeft,
  ArrowRight,
  Check,
  X
} from "lucide-react";

const STEPS = ["Photo", "Review", "People", "Assign", "Split"];

const newId = () => Math.random().toString(36).slice(2, 9);

const money = (n) => `₹${Number(n || 0).toFixed(2)}`;

const emptyBill = {
  items: [],
  subtotal: 0,
  discount: 0,
  serviceCharge: 0,
  tax: 0,
  total: 0
};

export default function SplitTheBill() {
  const fileRef = useRef(null);

  const [step, setStep] = useState(0);
  const [images, setImages] = useState([]);
  const [bill, setBill] = useState(emptyBill);
  const [people, setPeople] = useState([]);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // ---------------- PHOTO ----------------

  const addPhotos = (e) => {
    const files = Array.from(e.target.files || []);

    if (!files.length) return;

    const selected = files.slice(0, 4).map((file) => ({
      id: newId(),
      file,
      url: URL.createObjectURL(file)
    }));

    setImages((prev) => [...prev, ...selected].slice(0, 4));
    setError("");
  };

  const removePhoto = (id) => {
    setImages((prev) => prev.filter((img) => img.id !== id));
  };

  // ---------------- OCR ----------------

  const extractBill = async () => {
    if (!images.length) {
      setError("Please upload a bill photo first.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const formData = new FormData();

      images.forEach((img) => {
        formData.append("files", img.file);
      });

      const response = await fetch(
        "http://127.0.0.1:8000/api/extract",
        {
          method: "POST",
          body: formData
        }
      );

      if (!response.ok) {
        throw new Error("OCR request failed");
      }

      const data = await response.json();

      const extractedItems = (data.items || []).map((item) => ({
        id: newId(),
        name: item.name || "Item",
        price: Number(item.price || 0),
        quantity: Number(item.quantity || 1)
      }));

      const subtotal = extractedItems.reduce(
        (sum, item) => sum + item.price * item.quantity,
        0
      );

      setBill({
        items: extractedItems,
        subtotal,
        discount: Number(data.discount || 0),
        serviceCharge: Number(data.serviceCharge || 0),
        tax: Number(data.tax || 0),
        total: Number(data.total || subtotal)
      });

      setStep(1);
    } catch (err) {
      setError("Could not read the bill. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // ---------------- BILL EDITING ----------------

  const updateItem = (id, field, value) => {
    setBill((prev) => {
      const items = prev.items.map((item) =>
        item.id === id
          ? {
              ...item,
              [field]:
                field === "name" ? value : Number(value)
            }
          : item
      );

      const subtotal = items.reduce(
        (sum, item) => sum + item.price * item.quantity,
        0
      );

      return {
        ...prev,
        items,
        subtotal
      };
    });
  };

  const deleteItem = (id) => {
    setBill((prev) => ({
      ...prev,
      items: prev.items.filter((item) => item.id !== id)
    }));
  };

  const addItem = () => {
    setBill((prev) => ({
      ...prev,
      items: [
        ...prev.items,
        {
          id: newId(),
          name: "New Item",
          price: 0,
          quantity: 1
        }
      ]
    }));
  };

  // ---------------- PEOPLE ----------------

  const addPerson = () => {
    const trimmed = name.trim();

    if (!trimmed) return;

    setPeople((prev) => [
      ...prev,
      {
        id: newId(),
        name: trimmed,
        items: []
      }
    ]);

    setName("");
  };

  const removePerson = (id) => {
    setPeople((prev) => prev.filter((p) => p.id !== id));
  };

  // ---------------- ASSIGN ITEMS ----------------

  const toggleAssignment = (personId, itemId) => {
    setPeople((prev) =>
      prev.map((person) => {
        if (person.id !== personId) return person;

        const exists = person.items.includes(itemId);

        return {
          ...person,
          items: exists
            ? person.items.filter((id) => id !== itemId)
            : [...person.items, itemId]
        };
      })
    );
  };

  const assignEveryone = (itemId) => {
    setPeople((prev) =>
      prev.map((person) => ({
        ...person,
        items: person.items.includes(itemId)
          ? person.items
          : [...person.items, itemId]
      }))
    );
  };

  // ---------------- SPLIT ----------------

  const calculateSplit = () => {
    if (!people.length) return [];

    const result = people.map((person) => {
      const assignedItems = bill.items.filter((item) =>
        person.items.includes(item.id)
      );

      const itemTotal = assignedItems.reduce(
        (sum, item) => sum + item.price * item.quantity,
        0
      );

      return {
        ...person,
        itemTotal
      };
    });

    const subtotal = bill.subtotal || 1;

    return result.map((person) => {
      const ratio = person.itemTotal / subtotal;

      const discount = bill.discount * ratio;
      const service = bill.serviceCharge * ratio;
      const tax = bill.tax * ratio;

      const finalAmount =
        person.itemTotal -
        discount +
        service +
        tax;

      return {
        ...person,
        discount,
        service,
        tax,
        finalAmount
      };
    });
  };

  const splitResult = calculateSplit();

  // ---------------- RESET ----------------

  const reset = () => {
    setStep(0);
    setImages([]);
    setBill(emptyBill);
    setPeople([]);
    setName("");
    setError("");
  };

  // ---------------- UI HELPERS ----------------

  const next = () => {
    if (step === 0) extractBill();
    else setStep((prev) => Math.min(prev + 1, 4));
  };

  const back = () => {
    setStep((prev) => Math.max(prev - 1, 0));
  };

  return (
    <div className="app">
      <style>{`
        * {
          box-sizing: border-box;
        }

        body {
          margin: 0;
          font-family: Arial, sans-serif;
          background: #f5f5f5;
        }

        .app {
          max-width: 900px;
          margin: auto;
          padding: 30px 20px;
        }

        h1 {
          margin-bottom: 5px;
        }

        .subtitle {
          color: #666;
          margin-bottom: 30px;
        }

        .steps {
          display: flex;
          justify-content: space-between;
          margin-bottom: 30px;
        }

        .step {
          padding: 10px 15px;
          border-radius: 20px;
          background: #ddd;
        }

        .active {
          background: #111;
          color: white;
        }

        .card {
          background: white;
          padding: 25px;
          border-radius: 15px;
          box-shadow: 0 5px 20px #0001;
        }

        button {
          border: 0;
          padding: 10px 15px;
          border-radius: 8px;
          cursor: pointer;
          background: #111;
          color: white;
        }

        button.secondary {
          background: #ddd;
          color: #111;
        }

        button.danger {
          background: #d33;
        }

        input {
          padding: 10px;
          border: 1px solid #ccc;
          border-radius: 7px;
          width: 100%;
        }

        .row {
          display: flex;
          gap: 10px;
          align-items: center;
          margin-bottom: 10px;
        }

        .row > * {
          flex: 1;
        }

        .photos {
          display: flex;
          gap: 15px;
          flex-wrap: wrap;
          margin: 20px 0;
        }

        .photo {
          position: relative;
        }

        .photo img {
          width: 150px;
          height: 150px;
          object-fit: cover;
          border-radius: 10px;
        }

        .photo button {
          position: absolute;
          right: 5px;
          top: 5px;
          padding: 5px;
        }

        .actions {
          display: flex;
          justify-content: space-between;
          margin-top: 25px;
        }

        .person {
          border: 1px solid #ddd;
          padding: 15px;
          border-radius: 10px;
          margin-bottom: 10px;
        }

        .item {
          border: 1px solid #ddd;
          padding: 15px;
          border-radius: 10px;
          margin-bottom: 12px;
        }

        .assignment {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          margin-top: 10px;
        }

        .assignment button {
          background: #eee;
          color: #111;
        }

        .assignment button.selected {
          background: #111;
          color: white;
        }

        .result {
          padding: 15px;
          background: #f1f1f1;
          border-radius: 10px;
          margin-bottom: 10px;
        }

        .error {
          background: #fee;
          color: #c00;
          padding: 10px;
          border-radius: 8px;
          margin: 15px 0;
        }
      `}</style>

      <h1>Split The Bill</h1>
      <p className="subtitle">
        Upload your bill and split it easily.
      </p>

      {/* STEPS */}

      <div className="steps">
        {STEPS.map((item, index) => (
          <div
            key={item}
            className={`step ${index === step ? "active" : ""}`}
          >
            {index + 1}. {item}
          </div>
        ))}
      </div>

      {error && <div className="error">{error}</div>}

      {/* PHOTO STEP */}

      {step === 0 && (
        <div className="card">
          <h2>Upload Bill</h2>

          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={addPhotos}
          />

          <button onClick={() => fileRef.current.click()}>
            <Camera size={18} /> Choose Photos
          </button>

          <div className="photos">
            {images.map((img) => (
              <div className="photo" key={img.id}>
                <img src={img.url} alt="bill" />

                <button
                  className="danger"
                  onClick={() => removePhoto(img.id)}
                >
                  <X size={15} />
                </button>
              </div>
            ))}
          </div>

          <div className="actions">
            <span>
              {images.length}/4 photos selected
            </span>

            <button
              disabled={loading}
              onClick={next}
            >
              {loading ? "Reading..." : "Extract Bill"}
              <ArrowRight size={17} />
            </button>
          </div>
        </div>
      )}

      {/* REVIEW STEP */}

      {step === 1 && (
        <div className="card">
          <h2>Review Bill</h2>

          {bill.items.map((item) => (
            <div className="item" key={item.id}>
              <div className="row">
                <input
                  value={item.name}
                  onChange={(e) =>
                    updateItem(
                      item.id,
                      "name",
                      e.target.value
                    )
                  }
                />

                <input
                  type="number"
                  value={item.price}
                  onChange={(e) =>
                    updateItem(
                      item.id,
                      "price",
                      e.target.value
                    )
                  }
                />

                <input
                  type="number"
                  value={item.quantity}
                  onChange={(e) =>
                    updateItem(
                      item.id,
                      "quantity",
                      e.target.value
                    )
                  }
                />

                <button
                  className="danger"
                  onClick={() => deleteItem(item.id)}
                >
                  <Trash2 size={17} />
                </button>
              </div>
            </div>
          ))}

          <button
            className="secondary"
            onClick={addItem}
          >
            <Plus size={17} /> Add Item
          </button>

          <hr />

          <p>Subtotal: {money(bill.subtotal)}</p>
          <p>Discount: {money(bill.discount)}</p>
          <p>Service: {money(bill.serviceCharge)}</p>
          <p>Tax: {money(bill.tax)}</p>
          <h3>Total: {money(bill.total)}</h3>

          <div className="actions">
            <button
              className="secondary"
              onClick={back}
            >
              <ArrowLeft size={17} /> Back
            </button>

            <button onClick={next}>
              Next <ArrowRight size={17} />
            </button>
          </div>
        </div>
      )}

      {/* PEOPLE STEP */}

      {step === 2 && (
        <div className="card">
          <h2>Add People</h2>

          <div className="row">
            <input
              placeholder="Person name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") addPerson();
              }}
            />

            <button onClick={addPerson}>
              <Plus size={17} /> Add
            </button>
          </div>

          {people.map((person) => (
            <div className="person" key={person.id}>
              <div className="row">
                <strong>{person.name}</strong>

                <button
                  className="danger"
                  onClick={() =>
                    removePerson(person.id)
                  }
                >
                  <Trash2 size={17} />
                </button>
              </div>
            </div>
          ))}

          <p>
            {people.length}{" "}
            {people.length === 1 ? "person" : "people"} added
          </p>

          <div className="actions">
            <button
              className="secondary"
              onClick={back}
            >
              <ArrowLeft size={17} /> Back
            </button>

            <button
              disabled={!people.length}
              onClick={next}
            >
              Next <ArrowRight size={17} />
            </button>
          </div>
        </div>
      )}

      {/* ASSIGN STEP */}

      {step === 3 && (
        <div className="card">
          <h2>Assign Items</h2>

          {bill.items.map((item) => (
            <div className="item" key={item.id}>
              <strong>
                {item.name} — {money(item.price)}
              </strong>

              <div className="assignment">
                {people.map((person) => (
                  <button
                    key={person.id}
                    className={
                      person.items.includes(item.id)
                        ? "selected"
                        : ""
                    }
                    onClick={() =>
                      toggleAssignment(
                        person.id,
                        item.id
                      )
                    }
                  >
                    {person.name}
                  </button>
                ))}

                <button
                  onClick={() =>
                    assignEveryone(item.id)
                  }
                >
                  Everyone
                </button>
              </div>
            </div>
          ))}

          <div className="actions">
            <button
              className="secondary"
              onClick={back}
            >
              <ArrowLeft size={17} /> Back
            </button>

            <button onClick={next}>
              Calculate <Check size={17} />
            </button>
          </div>
        </div>
      )}

      {/* SPLIT RESULT */}

      {step === 4 && (
        <div className="card">
          <h2>Split Result</h2>

          {splitResult.map((person) => (
            <div className="result" key={person.id}>
              <h3>{person.name}</h3>

              <p>
                Items: {money(person.itemTotal)}
              </p>

              <p>
                Discount: -{money(person.discount)}
              </p>

              <p>
                Service: +{money(person.service)}
              </p>

              <p>
                Tax: +{money(person.tax)}
              </p>

              <h2>
                Pay: {money(person.finalAmount)}
              </h2>
            </div>
          ))}

          <div className="actions">
            <button
              className="secondary"
              onClick={back}
            >
              <ArrowLeft size={17} /> Back
            </button>

            <button onClick={reset}>
              Start Again
            </button>
          </div>
        </div>
      )}
    </div>
  );
}