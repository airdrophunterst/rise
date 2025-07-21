require("dotenv").config();
const { _isArray } = require("../utils/utils.js");

const settings = {
  TIME_SLEEP: process.env.TIME_SLEEP ? parseInt(process.env.TIME_SLEEP) : 8,
  MAX_THEADS: process.env.MAX_THEADS ? parseInt(process.env.MAX_THEADS) : 10,
  MAX_LEVEL_SPEED: process.env.MAX_LEVEL_SPEED ? parseInt(process.env.MAX_LEVEL_SPEED) : 10,
  MAX_THEADS_NO_PROXY: process.env.MAX_THEADS_NO_PROXY ? parseInt(process.env.MAX_THEADS_NO_PROXY) : 10,
  AMOUNT_REF: process.env.AMOUNT_REF ? parseInt(process.env.AMOUNT_REF) : 100,
  NUMBER_OF_TRANSFER: process.env.NUMBER_OF_TRANSFER ? parseInt(process.env.NUMBER_OF_TRANSFER) : 10,
  NUMBER_OF_SWAP: process.env.NUMBER_OF_SWAP ? parseInt(process.env.NUMBER_OF_SWAP) : 10,

  ESTIMATED_GAS: process.env.ESTIMATED_GAS ? parseInt(process.env.ESTIMATED_GAS) : 200000,

  SKIP_TASKS: process.env.SKIP_TASKS ? JSON.parse(process.env.SKIP_TASKS.replace(/'/g, '"')) : [],
  TYPE_HERO_UPGRADE: process.env.TYPE_HERO_UPGRADE ? JSON.parse(process.env.TYPE_HERO_UPGRADE.replace(/'/g, '"')) : [],
  TYPE_HERO_RESET: process.env.TYPE_HERO_RESET ? JSON.parse(process.env.TYPE_HERO_RESET.replace(/'/g, '"')) : [],
  CODE_GATEWAY: process.env.CODE_GATEWAY ? JSON.parse(process.env.CODE_GATEWAY.replace(/'/g, '"')) : [],
  TASKS_ID: process.env.TASKS_ID ? JSON.parse(process.env.TASKS_ID.replace(/'/g, '"')) : [],
  TOKENS_FAUCET: process.env.TOKENS_FAUCET ? JSON.parse(process.env.TOKENS_FAUCET.replace(/'/g, '"')) : [],

  AUTO_TASK: process.env.AUTO_TASK ? process.env.AUTO_TASK.toLowerCase() === "true" : false,
  AUTO_CHALLENGE: process.env.AUTO_CHALLENGE ? process.env.AUTO_CHALLENGE.toLowerCase() === "true" : false,
  ENABLE_MAP_RANGE_CHALLENGE: process.env.ENABLE_MAP_RANGE_CHALLENGE ? process.env.ENABLE_MAP_RANGE_CHALLENGE.toLowerCase() === "true" : false,

  AUTO_SHOW_COUNT_DOWN_TIME_SLEEP: process.env.AUTO_SHOW_COUNT_DOWN_TIME_SLEEP ? process.env.AUTO_SHOW_COUNT_DOWN_TIME_SLEEP.toLowerCase() === "true" : false,
  AUTO_CLAIM_BONUS: process.env.AUTO_CLAIM_BONUS ? process.env.AUTO_CLAIM_BONUS.toLowerCase() === "true" : false,
  ENABLE_ADVANCED_MERGE: process.env.ENABLE_ADVANCED_MERGE ? process.env.ENABLE_ADVANCED_MERGE.toLowerCase() === "true" : false,
  ENABLE_DEBUG: process.env.ENABLE_DEBUG ? process.env.ENABLE_DEBUG.toLowerCase() === "true" : false,

  AUTO_UPGRADE_SPEED: process.env.AUTO_UPGRADE_SPEED ? process.env.AUTO_UPGRADE_SPEED.toLowerCase() === "true" : false,
  AUTO_BUY_PET: process.env.AUTO_BUY_PET ? process.env.AUTO_BUY_PET.toLowerCase() === "true" : false,
  AUTO_SELL_PET: process.env.AUTO_SELL_PET ? process.env.AUTO_SELL_PET.toLowerCase() === "true" : false,
  AUTO_FAUCET: process.env.AUTO_FAUCET ? process.env.AUTO_FAUCET.toLowerCase() === "true" : false,

  ADVANCED_ANTI_DETECTION: process.env.ADVANCED_ANTI_DETECTION ? process.env.ADVANCED_ANTI_DETECTION.toLowerCase() === "true" : false,
  AUTO_TAP: process.env.AUTO_TAP ? process.env.AUTO_TAP.toLowerCase() === "true" : false,
  USE_PROXY: process.env.USE_PROXY ? process.env.USE_PROXY.toLowerCase() === "true" : false,
  AUTO_DAILY_COMBO: process.env.AUTO_DAILY_COMBO ? process.env.AUTO_DAILY_COMBO.toLowerCase() === "true" : false,
  AUTO_BUY_BOX: process.env.AUTO_BUY_BOX ? process.env.AUTO_BUY_BOX.toLowerCase() === "true" : false,

  API_ID: process.env.API_ID ? process.env.API_ID : null,
  BASE_URL: process.env.BASE_URL ? process.env.BASE_URL : "https://game-api-v2.xoob.gg/api",
  BASE_URL_v2: process.env.BASE_URL_v2 ? process.env.BASE_URL_v2 : "https://game-api.xoob.gg/g",
  REF_CODE: process.env.REF_CODE ? process.env.REF_CODE : "",
  RPC_URL: process.env.RPC_URL ? process.env.RPC_URL : "https://testnet.riselabs.xyz",
  CHAIN_ID: process.env.CHAIN_ID ? process.env.CHAIN_ID : 11155931,

  TYPE_CAPTCHA: process.env.TYPE_CAPTCHA ? process.env.TYPE_CAPTCHA : null,
  API_KEY_2CAPTCHA: process.env.API_KEY_2CAPTCHA ? process.env.API_KEY_2CAPTCHA : null,
  API_KEY_ANTI_CAPTCHA: process.env.API_KEY_ANTI_CAPTCHA ? process.env.API_KEY_ANTI_CAPTCHA : null,
  API_KEY_CAPMONSTER: process.env.API_KEY_CAPMONSTER ? process.env.API_KEY_CAPMONSTER : null,
  CAPTCHA_URL: process.env.CAPTCHA_URL ? process.env.CAPTCHA_URL : null,
  WEBSITE_KEY: process.env.WEBSITE_KEY ? process.env.WEBSITE_KEY : null,
  DAILY_COMBO: process.env.DAILY_COMBO ? process.env.DAILY_COMBO : null,
  CLIVER: process.env.CLIVER ? process.env.CLIVER : null,

  DELAY_BETWEEN_REQUESTS: process.env.DELAY_BETWEEN_REQUESTS && _isArray(process.env.DELAY_BETWEEN_REQUESTS) ? JSON.parse(process.env.DELAY_BETWEEN_REQUESTS) : [1, 5],
  DELAY_START_BOT: process.env.DELAY_START_BOT && _isArray(process.env.DELAY_START_BOT) ? JSON.parse(process.env.DELAY_START_BOT) : [1, 15],
  DELAY_TAP: process.env.DELAY_TAP && _isArray(process.env.DELAY_TAP) ? JSON.parse(process.env.DELAY_TAP) : [1, 15],
  AMOUNT_TAPS: process.env.AMOUNT_TAPS && _isArray(process.env.AMOUNT_TAPS) ? JSON.parse(process.env.AMOUNT_TAPS) : [10, 15],
  AMOUNT_TRANSFER: process.env.AMOUNT_TRANSFER && _isArray(process.env.AMOUNT_TRANSFER) ? JSON.parse(process.env.AMOUNT_TRANSFER) : [0.001, 0.01],
  AMOUNT_STAKE: process.env.AMOUNT_STAKE && _isArray(process.env.AMOUNT_STAKE) ? JSON.parse(process.env.AMOUNT_STAKE) : [0.1, 1],
  AMOUNT_DEPOSIT: process.env.AMOUNT_DEPOSIT && _isArray(process.env.AMOUNT_DEPOSIT) ? JSON.parse(process.env.AMOUNT_DEPOSIT) : [0.1, 1],
  AMOUNT_WITHDRAW: process.env.AMOUNT_WITHDRAW && _isArray(process.env.AMOUNT_WITHDRAW) ? JSON.parse(process.env.AMOUNT_WITHDRAW) : [0.1, 1],
  AMOUNT_SWAP: process.env.AMOUNT_SWAP && _isArray(process.env.AMOUNT_SWAP) ? JSON.parse(process.env.AMOUNT_SWAP) : [0.1, 1],
};

module.exports = settings;
