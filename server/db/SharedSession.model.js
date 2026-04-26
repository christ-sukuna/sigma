const { mongoose } = require('./mongoose');

const SharedSessionSchema = new mongoose.Schema({
  deploySessionId: { type: String, required: true, unique: true, index: true },
  phoneNumber:     { type: String, required: true },
  sessionDir:      { type: String, required: true },
  status:          { type: String, default: 'pending' },
  startedAt:       { type: Date,   default: Date.now },
  lastActivity:    { type: Date,   default: Date.now },
}, { timestamps: true });

module.exports = mongoose.model('SharedSession', SharedSessionSchema);
