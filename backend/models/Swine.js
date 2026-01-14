const mongoose = require("mongoose");

const swineSchema = new mongoose.Schema({
  // ------------------- Basic Swine Info -------------------
  swine_id: { type: String, required: true, unique: true },
  registered_by: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  farmer_id: { type: mongoose.Schema.Types.ObjectId, ref: "Farmer", required: true },
  sex: { type: String, enum: ["Male", "Female"], required: true },
  color: { type: String },
  breed: { type: String },
  birth_date: { type: Date },
  batch: { type: String, required: true },

  // ------------------- Current Lifecycle State -------------------
  current_status: {
    type: String,
    enum: [
      // Piglet / Growth Path
      "1st Selection Ongoing",     
      "Monitoring (Day 1-30)",     
      "Weaned",                    
      "2nd Selection Ongoing",     
      "Monitoring (3 Months)",     
      
      // Adult / Reproductive Path
      "Open",                      
      "In-Heat",                   
      "Bred",                      
      "Pregnant",                  
      "Lactating",                 
      
      // Exit Path
      "Market-Ready",              
      "Culled/Sold"                
    ],
    default: "1st Selection Ongoing"
  },

  age_stage: { 
    type: String, 
    enum: ["piglet", "adult"], 
    required: true, 
    default: "piglet" 
  },

  health_status: {
    type: String,
    enum: ["Healthy", "Sick", "Deceased (Before Weaning)", "Deceased"],
    default: "Healthy"
  },

  // ------------------- Lineage -------------------
  sire_id: { type: String }, 
  dam_id: { type: String },  

  // ------------------- Reproductive Cycles -------------------
  breeding_cycles: [{
    cycle_number: { type: Number },
    estrus_date: { type: Date },
    ai_service_date: { type: Date },
    pregnancy_check_date: { type: Date }, 
    is_pregnant: { type: Boolean, default: false },
    expected_farrowing_date: { type: Date },
    actual_farrowing_date: { type: Date },
    
    farrowing_results: {
      total_piglets: { type: Number, default: 0 },
      male_count: { type: Number, default: 0 },
      female_count: { type: Number, default: 0 },
      mortality_count: { type: Number, default: 0 }
    }
  }],

  // ------------------- Medical & Health Tracking -------------------
  // Captures "injections" (Iron, Vaccines) and treatments
  medical_records: [{
    treatment_type: { 
      type: String, 
      enum: ["Vaccination", "Iron Injection", "Deworming", "Antibiotic", "Vitamin", "Other"] 
    },
    medicine_name: { type: String },
    dosage: { type: String },
    admin_date: { type: Date, default: Date.now },
    remarks: { type: String },
    administered_by: { type: mongoose.Schema.Types.ObjectId, ref: "User" }
  }],

  // ------------------- Growth & Selection (Stages 1 & 2) -------------------
  performance_records: [{
    stage: { 
      type: String, 
      enum: ["1st Stage Selection", "2nd Stage Selection", "Market Check", "Routine"] 
    },
    record_date: { type: Date, default: Date.now },
    weight: { type: Number },
    body_length: { type: Number },
    heart_girth: { type: Number },
    teeth_count: { type: Number },
    teeth_alignment: { type: String },
    leg_conformation: { type: String },
    // Teat count is vital for female selection (Morphological)
    teat_count: { type: Number }, 
    deformities: { type: [String], default: ["None"] },
    passed_selection: { type: Boolean, default: true },
    recorded_by: { type: mongoose.Schema.Types.ObjectId, ref: "User" }
  }],

  // ------------------- Metadata -------------------
  date_transfer: { type: Date },
  date_registered: { type: Date, default: Date.now }
}, { timestamps: true });

// ------------------- Logic / Helpers -------------------

/**
 * Middleware: Automatically calculate Expected Farrowing Date 
 */
swineSchema.pre("save", function(next) {
  if (this.breeding_cycles && this.breeding_cycles.length > 0) {
    const latestCycle = this.breeding_cycles[this.breeding_cycles.length - 1];
    if (latestCycle.ai_service_date && !latestCycle.expected_farrowing_date) {
      const gestationDays = 114;
      const farrowDate = new Date(latestCycle.ai_service_date);
      farrowDate.setDate(farrowDate.getDate() + gestationDays);
      latestCycle.expected_farrowing_date = farrowDate;
    }
  }
  next();
});

module.exports = mongoose.model("Swine", swineSchema);