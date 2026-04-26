const { mongoose } = require('./mongoose');

const VpsSessionSchema = new mongoose.Schema({
  deployId:    { type: String, required: true, unique: true, index: true },
  userId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
  botName:     { type: String, required: true },
  displayName: { type: String, default: '' },
  phoneNumber: { type: String, required: true },
  status:      { type: String, default: 'deploying' },
  pairCode:    { type: String, default: null },
  port:        { type: Number, required: true },
  config:      { type: Object, default: {} },
  deployedAt:  { type: Date, default: Date.now },
  lastActivity:{ type: Date, default: Date.now },
  connectedAt: { type: Date, default: null },
  errorMsg:    { type: String, default: null },
  msgCount:    { type: Number, default: 0 },
  lastMsgAt:   { type: Date, default: null },
  healthAlert: {
    type:    { type: String, default: null },
    msg:     { type: String, default: null },
    at:      { type: Date, default: null },
  },
  sessionBackupAt: { type: Date, default: null },
}, { timestamps: true });

module.exports = mongoose.model('VpsSession', VpsSessionSchema);
