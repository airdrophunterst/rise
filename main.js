const ethers = require("ethers");
const readline = require("readline");
const colors = require("colors");
const { HttpsProxyAgent } = require("https-proxy-agent");
const settings = require("./config/config");
const { showBanner } = require("./core/banner");
const axios = require("axios");
const { sleep, loadData, getRandomNumber, saveToken, isTokenExpired, saveJson, getRandomElement } = require("./utils/utils.js");
const { Worker, isMainThread, parentPort, workerData } = require("worker_threads");
const { solveCaptcha } = require("./utils/captcha.js");
const { CONTRACT_ADDRESSES, WrappedTokenGatewayV3ABI, WETH_ABI, DODOFeeRouteProxyABI, USDC_ABI, network } = require("./core/contract.js");
const wallets = loadData("wallets.txt");
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

async function connectToNetwork(proxyUrl, privateKey) {
  let wallet = null;
  let provider = null;

  try {
    // Validate network configuration
    if (!network || !network.rpc || !network.name) {
      throw new Error("Invalid network configuration.");
    }

    // Cấu hình proxy nếu proxyUrl được cung cấp
    const providerOptions = proxyUrl ? { fetchOptions: { agent: new HttpsProxyAgent(proxyUrl) } } : {};

    // Tạo provider với proxy
    provider = new ethers.JsonRpcProvider(
      network.rpc,
      {
        chainId: Number(network.chainId),
        name: network.name,
      },
      providerOptions
    );

    // Tạo ví liên kết với provider
    wallet = new ethers.Wallet(privateKey, provider);

    // Kiểm tra kết nối bằng cách lấy số block hiện tại
    const blockNumber = await provider.getBlockNumber();
    if (blockNumber) {
      console.log(colors.green(`Connected to ${network.name} at block ${blockNumber}.`));
    }

    return { provider, wallet, proxyUrl };
  } catch (error) {
    console.error(`[${wallet?.address || "N/A"}] Connection error:`, error.message);
    return { provider: null, wallet, proxyUrl };
  }
}

async function askQuest(question) {
  return new Promise((resolve) => {
    rl.question(colors.yellow(`${question} `), (answer) => {
      resolve(answer);
    });
  });
}

class ClientAPI {
  constructor(itemData, accountIndex, proxy, baseURL, authInfos) {
    this.baseURL = baseURL;
    this.baseURL_v2 = "";
    this.itemData = itemData;
    this.accountIndex = accountIndex;
    this.proxy = proxy;
    this.proxyIP = null;
    this.session_name = null;
    this.wallet = new ethers.Wallet(this.itemData.privateKey);
    this.provider = null;
  }

  async log(msg, type = "info") {
    const accountPrefix = `[RISE][${this.accountIndex + 1}][${this.itemData.address}]`;
    let ipPrefix = "[Local IP]";
    if (settings.USE_PROXY) {
      ipPrefix = this.proxyIP ? `[${this.proxyIP}]` : "[Unknown IP]";
    }
    let logMessage = "";

    switch (type) {
      case "success":
        logMessage = `${accountPrefix}${ipPrefix} ${msg}`.green;
        break;
      case "error":
        logMessage = `${accountPrefix}${ipPrefix} ${msg}`.red;
        break;
      case "warning":
        logMessage = `${accountPrefix}${ipPrefix} ${msg}`.yellow;
        break;
      case "custom":
        logMessage = `${accountPrefix}${ipPrefix} ${msg}`.magenta;
        break;
      case "info":
        logMessage = `${accountPrefix}${ipPrefix} ${msg}`.blue;
        break;
      default:
        logMessage = `${accountPrefix}${ipPrefix} ${msg}`;
    }
    console.log(logMessage);
  }

  async checkProxyIP() {
    try {
      const proxyAgent = new HttpsProxyAgent(this.proxy);
      const response = await axios.get("https://api.ipify.org?format=json", { httpsAgent: proxyAgent });
      if (response.status === 200) {
        this.proxyIP = response.data.ip;
        return response.data.ip;
      } else {
        throw new Error(`Cannot check proxy IP. Status code: ${response.status}`);
      }
    } catch (error) {
      throw new Error(`Error checking proxy IP: ${error.message}`);
    }
  }

  async getWalletInfo(wallet) {
    try {
      this.log(`Syncing balance...`);
      const address = wallet.address;

      // Lấy số dư ETH
      const ethBalance = await wallet.provider.getBalance(address).catch((err) => {
        console.error("Error fetching ETH balance:", err);
        return 0n; // Trả về 0n nếu có lỗi
      });

      // Lấy số dư WETH và USDC
      const wethContract = new ethers.Contract(CONTRACT_ADDRESSES.WETH, WETH_ABI, wallet);
      const usdcContract = new ethers.Contract(CONTRACT_ADDRESSES.USDC, USDC_ABI, wallet);

      const wethBalance = await wethContract.balanceOf(address).catch((err) => {
        console.error("Error fetching WETH balance:", err);
        return 0n;
      });

      const usdcBalance = await usdcContract.balanceOf(address).catch((err) => {
        console.error("Error fetching USDC balance:", err);
        return 0n;
      });

      const usdcDecimals = await usdcContract.decimals().catch(() => {
        console.warn("Error fetching USDC decimals, defaulting to 6.");
        return 6;
      });

      // Hiển thị thông tin ví
      this.log(
        colors.white(
          `Wallet Address: ${colors.cyan(address)} | ` +
            `Balance USDC: ${colors.cyan(ethers.formatUnits(usdcBalance, usdcDecimals))} | ` +
            `ETH: ${colors.cyan(ethers.formatEther(ethBalance))} | ` +
            `WETH: ${colors.cyan(ethers.formatEther(wethBalance))}`
        )
      );
    } catch (error) {
      console.error("Error getting wallet info:", error);
      this.log(colors.red(`Failed to retrieve wallet info: ${error.message} ❌`));
    }
  }

  async depositETHToGateway(wallet) {
    try {
      this.log(colors.yellow("WARNING: Verify WrappedTokenGatewayV3 address for Rise Testnet before proceeding."));
      const feeData = await wallet.provider.getFeeData();
      const gasPrice = feeData.gasPrice;
      const estimatedGas = 310079n;
      const gasCost = gasPrice * estimatedGas;
      const balance = await wallet.provider.getBalance(wallet.address);

      // Kiểm tra xem số dư có đủ để chi trả phí gas không
      if (balance < gasCost) {
        this.log(colors.red(`Insufficient balance for gas. Available: ${ethers.formatEther(balance)} ETH | Required: ${ethers.formatEther(gasCost)} ETH 🚫`));
        return null; // Bỏ qua nếu không đủ phí gas
      }

      let amount = getRandomNumber(settings.AMOUNT_DEPOSIT[0], settings.AMOUNT_DEPOSIT[1], 4);
      let amountWei = ethers.parseUnits(amount.toString(), 18);
      const totalCost = amountWei + gasCost; // Tổng chi phí tính bằng Wei

      if (balance < totalCost) {
        const availableAmount = ethers.formatUnits(balance - gasCost, 18);
        amount = parseFloat(availableAmount) * 0.85; // Gán amount cho 85% số dư hiện tại
        amountWei = ethers.parseUnits(amount.toFixed(8).toString(), 18);
        this.log(colors.yellow(`Insufficient balance for deposit, current: ${ethers.formatEther(String(balance))} (required: ${amount}). Adjusting to ${amount} ETH.`));
      }

      const gatewayContract = new ethers.Contract(CONTRACT_ADDRESSES.WrappedTokenGatewayV3, WrappedTokenGatewayV3ABI, wallet);

      this.log(colors.yellow(`Supplying ${amount} ETH to Inari Bank...`));
      const nonce = await this.getNonce(wallet);
      const tx = await gatewayContract.depositETH("0x81edb206Fd1FB9dC517B61793AaA0325c8d11A23", wallet.address, 0, {
        value: amountWei,
        gasLimit: estimatedGas,
        maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
        maxFeePerGas: feeData.maxFeePerGas,
        nonce,
      });

      this.log(colors.white(`Transaction sent! Hash: ${colors.cyan(tx.hash)} 📤`));
      this.log("Waiting for confirmation...");
      const receipt = await tx.wait();
      this.log(colors.green(`Transaction confirmed in block ${receipt.blockNumber} ✅`));
    } catch (error) {
      this.log(colors.red(`Error supplying ETH: ${error.message} ❌`));
    }
  }

  async withdrawETHFromGateway(wallet) {
    try {
      this.log(colors.yellow("WARNING: Verify WrappedTokenGatewayV3 address for Rise Testnet before proceeding."));

      // Get contract instance
      const gatewayContract = new ethers.Contract(CONTRACT_ADDRESSES.WrappedTokenGatewayV3, WrappedTokenGatewayV3ABI, wallet);

      // Get user's WETH balance in the gateway (if applicable)
      // If the contract has a method to check deposited balance, use it here.
      // Example: const depositedBalance = await gatewayContract.balanceOf(wallet.address);

      const feeData = await wallet.provider.getFeeData();
      const estimatedGas = await gatewayContract.withdrawETH
        .estimateGas(
          "0x81edb206Fd1FB9dC517B61793AaA0325c8d11A23",
          ethers.parseEther("0.01"), // placeholder, will update below
          wallet.address,
          {
            maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
            maxFeePerGas: feeData.maxFeePerGas,
          }
        )
        .catch(() => 310079n); // fallback to default if estimation fails

      const gasCost = feeData.gasPrice * estimatedGas;
      const balance = await wallet.provider.getBalance(wallet.address);

      if (balance < gasCost) {
        this.log(colors.red(`Insufficient balance for gas. Available: ${ethers.formatEther(balance)} ETH | Required: ${ethers.formatEther(gasCost)} ETH 🚫`));
        return null;
      }

      let amount = getRandomNumber(settings.AMOUNT_WITHDRAW[0], settings.AMOUNT_WITHDRAW[1]);
      let amountWei = ethers.parseEther(amount.toString());
      const totalCost = amountWei + gasCost;

      if (balance < totalCost) {
        const availableAmount = ethers.formatEther(balance - gasCost);
        amount = parseFloat(availableAmount) * 0.85;
        amountWei = ethers.parseEther(amount.toFixed(8).toString());
        this.log(colors.yellow(`Insufficient balance for amount. Adjusting to ${amount} ETH.`));
      }

      // Optionally: Check deposited balance and adjust amountWei if needed

      this.log(colors.yellow(`Withdrawing ${amount} ETH from Inari Bank...`));
      const nonce = await this.getNonce(wallet);

      const tx = await gatewayContract.withdrawETH("0x81edb206Fd1FB9dC517B61793AaA0325c8d11A23", amountWei, wallet.address, {
        gasLimit: estimatedGas,
        maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
        maxFeePerGas: feeData.maxFeePerGas,
        nonce,
      });

      this.log(colors.white(`Transaction sent! Hash: ${colors.cyan(tx.hash)} 📤`));
      this.log("Waiting for confirmation...");
      const receipt = await tx.wait();
      this.log(colors.green(`Transaction confirmed in block ${receipt.blockNumber} ✅`));
    } catch (error) {
      this.log(colors.red(`Error: ${error.message}`));
      if (error.reason) this.log(colors.red(`Reason: ${error.reason}`));
      if (error.data) this.log(colors.red(`Data: ${JSON.stringify(error.data)}`));
      if (error.error) this.log(colors.red(`Error object: ${JSON.stringify(error.error)}`));
      console.error(error);
    }
  }

  async sendToAddress(wallet, amount, receiptAddress) {
    try {
      if (wallet.address === receiptAddress) return;

      const toAddress = receiptAddress;
      const amountWei = ethers.parseEther(amount.toString());
      const feeData = await wallet.provider.getFeeData();
      const estimatedGas = BigInt(settings.ESTIMATED_GAS || 100000); // Chuyển estimatedGas sang BigInt
      const gasCost = BigInt(feeData.gasPrice) * estimatedGas; // Chuyển gasPrice sang BigInt
      const totalCost = amountWei + gasCost; // Sử dụng toán tử + cho BigInt

      // Check wallet balance
      const balance = await wallet.provider.getBalance(wallet.address);
      if (balance < totalCost) {
        this.log(colors.red(`Insufficient balance. Available: ${ethers.formatEther(balance)} ETH | Required: ${ethers.formatEther(totalCost)} ETH 🚫`));
        return null;
      }

      const nonce = await this.getNonce(wallet);
      const tx = await wallet.sendTransaction({
        to: toAddress,
        value: amountWei,
        gasLimit: Number(estimatedGas), // Chuyển gasLimit về kiểu number
        nonce,
      });

      this.log(colors.white(`Transaction sent! Hash: ${colors.cyan(tx.hash)} 🚀`));
      this.log("Waiting for confirmation...", "info");
      const receipt = await tx.wait();
      this.log(colors.green(`Transaction confirmed in block ${receipt.blockNumber} ✅`));

      return { receipt, toAddress };
    } catch (error) {
      this.log(colors.red(`Error send ETH: ${error.message}❌`));
      return null;
    }
  }
  async wrapETH(wallet) {
    try {
      const feeData = await wallet.provider.getFeeData();
      const estimatedGas = 95312n;
      const gasCost = feeData.gasPrice * estimatedGas;

      const balance = await wallet.provider.getBalance(wallet.address);

      // Check if balance is sufficient for gas cost
      if (balance < gasCost) {
        this.log(colors.red(`Insufficient balance for gas. Available: ${ethers.formatEther(balance)} ETH | Required: ${ethers.formatEther(gasCost)} ETH 🚫`));
        return null; // Skip if insufficient gas
      }

      let amount = getRandomNumber(settings.AMOUNT_DEPOSIT[0], settings.AMOUNT_WITHDRAW[1]);
      let amountWei = ethers.parseEther(amount.toString());
      const totalCost = amountWei + gasCost; // Total cost in Wei

      // Check if balance is sufficient for total cost
      if (balance < totalCost) {
        const availableAmount = ethers.formatEther(balance - gasCost); // Balance after subtracting gas cost
        amount = parseFloat(availableAmount) * 0.85; // Set amount to 85% of current balance
        amountWei = ethers.parseEther(amount.toFixed(18).toString());
        this.log(colors.yellow(`Insufficient balance for amount. Adjusting to ${amount} ETH.`));
      }

      const wethContract = new ethers.Contract(CONTRACT_ADDRESSES.WETH, WETH_ABI, wallet);

      console.log(colors.yellow(`Wrapping ${amount} ETH to WETH...`));
      const nonce = await this.getNonce(wallet);
      const tx = await wethContract.deposit({
        value: amountWei,
        gasLimit: estimatedGas,
        maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
        maxFeePerGas: feeData.maxFeePerGas,
        nonce,
      });

      this.log(colors.white(`Transaction sent! Hash: ${colors.cyan(tx.hash)} 📤`));
      this.log("Waiting for confirmation...");
      const receipt = await tx.wait();
      this.log(colors.green(`Transaction confirmed in block ${receipt.blockNumber} ✅`));
    } catch (error) {
      this.log(colors.red(`Error wrap ETH: ${error.message}❌`));
    }
  }

  async unWrapETH(wallet) {
    try {
      const feeData = await wallet.provider.getFeeData();
      const estimatedGas = 95312n; // Sử dụng BigInt cho gas limit
      const gasCost = feeData.gasPrice * estimatedGas;

      const wethContract = new ethers.Contract(CONTRACT_ADDRESSES.WETH, WETH_ABI, wallet);
      const balance = await wethContract.balanceOf(wallet.address);

      // Kiểm tra xem số dư có đủ để chi trả phí gas không
      if (balance < gasCost) {
        this.log(colors.red(`Insufficient balance for gas. Available: ${ethers.formatEther(balance)} WETH | Required: ${ethers.formatEther(gasCost)} ETH 🚫`));
        return null; // Bỏ qua nếu không đủ phí gas
      }

      let amount = getRandomNumber(settings.AMOUNT_TRANSFER[0], settings.AMOUNT_TRANSFER[1]);
      let amountWei = ethers.parseEther(amount.toString());
      const totalCost = amountWei + gasCost; // Tổng chi phí tính bằng Wei

      // Kiểm tra số dư cho tổng chi phí
      if (balance < totalCost) {
        const availableAmount = ethers.formatEther(balance - gasCost); // Số dư sau khi trừ phí gas
        amount = parseFloat(availableAmount) * 0.85; // Gán amount cho 85% số dư hiện tại
        amountWei = ethers.parseEther(amount.toFixed(18).toString());
        this.log(colors.yellow(`Insufficient balance for amount. Adjusting to ${amount} WETH.`));
      }

      console.log(colors.yellow(`UnWrapping ${amount} WETH...`));
      const nonce = await this.getNonce(wallet);
      const tx = await wethContract.withdraw(amountWei, {
        gasLimit: estimatedGas,
        maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
        maxFeePerGas: feeData.maxFeePerGas,
        nonce,
      });

      this.log(colors.white(`Transaction sent! Hash: ${colors.cyan(tx.hash)} 📤`));
      this.log("Waiting for confirmation...");
      const receipt = await tx.wait();
      this.log(colors.green(`Transaction confirmed in block ${receipt.blockNumber} ✅`));
    } catch (error) {
      this.log(colors.red(`Error unwrap ETH: ${error.message} ❌`));
    }
  }

  async ensureTokenAllowance(wallet, tokenAddress, tokenABI, amountWei, spender, tokenSymbol) {
    try {
      const tokenContract = new ethers.Contract(tokenAddress, tokenABI, wallet);
      const allowance = await tokenContract.allowance(wallet.address, spender);

      if (allowance < amountWei) {
        const feeData = await wallet.provider.getFeeData();
        const estimatedGas = 100000n; // Sử dụng BigInt cho gas limit
        const gasCost = feeData.gasPrice * estimatedGas;

        const balance = await wallet.provider.getBalance(wallet.address);

        // Kiểm tra xem số dư có đủ để chi trả phí gas không
        if (balance < gasCost) {
          this.log(colors.red(`Insufficient balance for gas. Available: ${ethers.formatEther(balance)} ETH | Required: ${ethers.formatEther(gasCost)} ETH 🚫`));
          return false; // Bỏ qua nếu không đủ phí gas
        }
        const nonce = await this.getNonce(wallet);
        this.log(colors.yellow(`Approving ${ethers.formatUnits(amountWei, tokenSymbol === "WETH" ? 18 : 6)} ${tokenSymbol} for ${spender}...`));
        const tx = await tokenContract.approve(spender, amountWei, {
          gasLimit: estimatedGas,
          maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
          maxFeePerGas: feeData.maxFeePerGas,
          nonce,
        });

        this.log(colors.white(`Approval tx sent! Hash: ${colors.cyan(tx.hash)} 📤`));
        this.log("Waiting for confirmation...");
        const receipt = await tx.wait();

        this.log(colors.green(`Approval confirmed in block ${receipt.blockNumber} ✅`));
      }
      return true;
    } catch (error) {
      this.log(colors.red(`Error checking/approving ${tokenSymbol} allowance: ${error.message} ❌`));
      return false;
    }
  }

  async approveETH(wallet) {
    try {
      const wethContract = new ethers.Contract(CONTRACT_ADDRESSES.WETH, WETH_ABI, wallet);

      const feeData = await wallet.provider.getFeeData();
      const estimatedGas = 100000n; // Sử dụng BigInt cho gas limit
      const gasCost = feeData.gasPrice * estimatedGas;
      const amount = getRandomNumber(settings.AMOUNT_TRANSFER[0], settings.AMOUNT_TRANSFER[1]); // Lấy số lượng ngẫu nhiên
      const amountWei = ethers.parseEther(amount.toString());
      const balance = await wallet.provider.getBalance(wallet.address);

      // Kiểm tra xem số dư có đủ để chi trả phí gas không
      if (balance < gasCost) {
        this.log(colors.red(`Insufficient balance for gas. Available: ${ethers.formatEther(balance)} ETH | Required: ${ethers.formatEther(gasCost)} ETH 🚫`));
        return false; // Bỏ qua nếu không đủ phí gas
      }

      const nonce = await this.getNonce(wallet);
      this.log(colors.yellow(`Approving ${amount} WETH for DODOFeeRouteProxy...`));
      const tx = await wethContract.approve(CONTRACT_ADDRESSES.DODOFeeRouteProxy, amountWei, {
        gasLimit: estimatedGas,
        maxPriorityFeePerGas: feeData.maxPriorityFeePerGas,
        maxFeePerGas: feeData.maxFeePerGas,
        nonce,
      });

      this.log(colors.white(`Approval tx sent! Hash: ${colors.cyan(tx.hash)} 📤`));
      this.log("Waiting for confirmation...");
      const receipt = await tx.wait();

      this.log(colors.green(`Approval confirmed in block ${receipt.blockNumber} ✅`));
    } catch (error) {
      this.log(colors.red(`Error approving WETH: ${error.message} ❌`));
      return false;
    }
  }

  async getNonce(wallet) {
    const pendingNonce = await wallet.provider.getTransactionCount(wallet.address, "pending");
    const latestNonce = await wallet.provider.getTransactionCount(wallet.address, "latest");

    return pendingNonce > latestNonce ? pendingNonce : latestNonce;
  }

  async _swap(wallet, fromTokenAddress, toTokenAddress, amount, fromTokenSymbol, toTokenSymbol) {
    try {
      this.log(colors.yellow(`Preparing to swap ${fromTokenSymbol} to ${toTokenSymbol}...`));

      const fromTokenDecimals = fromTokenSymbol === "USDC" ? 6 : 18;
      const amountWei = ethers.parseUnits(amount.toString(), fromTokenDecimals);

      const tokenContract = new ethers.Contract(fromTokenAddress, USDC_ABI, wallet);
      const tokenBalance = await tokenContract.balanceOf(wallet.address);

      if (tokenBalance < amountWei) {
        this.log(colors.red(`Insufficient ${fromTokenSymbol} balance. Available: ${ethers.formatUnits(tokenBalance, fromTokenDecimals)}, Required: ${amount} ${fromTokenSymbol}`));
        return;
      }

      // Fetch quote from 0x API
      this.log("Getting quote from 0x API...");
      const slippage = "0.05"; // 5% slippage
      const qs = `buyToken=${toTokenAddress}&sellToken=${fromTokenAddress}&sellAmount=${amountWei.toString()}&slippagePercentage=${slippage}`;
      const response = await axios.get(`https://optimism.api.0x.org/swap/v1/quote?${qs}`);
      const quote = response.data;

      const balance = await wallet.provider.getBalance(wallet.address);
      const gasCost = BigInt(quote.gasPrice) * BigInt(quote.gas);

      if (balance < gasCost) {
        this.log(colors.red(`Insufficient balance for gas. Available: ${ethers.formatEther(balance)} ETH | Required: ${ethers.formatEther(gasCost)} ETH 🚫`));
        return;
      }

      const allowanceOk = await this.ensureTokenAllowance(wallet, fromTokenAddress, USDC_ABI, amountWei, quote.allowanceTarget, fromTokenSymbol);

      if (!allowanceOk) {
        this.log(colors.red("Cannot proceed with swap due to allowance issue. 🚫"));
        return;
      }

      this.log(colors.yellow(`Swapping ${amount} ${fromTokenSymbol} to ${toTokenSymbol}...`));
      const nonce = await this.getNonce(wallet);

      const tx = await wallet.sendTransaction({
        to: quote.to,
        data: quote.data,
        value: quote.value,
        gasPrice: quote.gasPrice,
        gasLimit: quote.gas,
        nonce,
      });

      this.log(colors.white(`Transaction sent! Hash: ${colors.cyan(tx.hash)} 📤`));
      this.log("Waiting for confirmation...");
      const receipt = await tx.wait();

      this.log(colors.green(`Transaction confirmed in block ${receipt.blockNumber} ✅`));
      this.log(colors.green(`Successfully swapped ${amount} ${fromTokenSymbol} to ${toTokenSymbol}! 🎉`));
    } catch (error) {
      let errorMessage = error.message;
      if (error.response && error.response.data && error.response.data.reason) {
        errorMessage = `0x API Error: ${error.response.data.reason}`;
      } else if (error.shortMessage) {
        errorMessage = error.shortMessage;
      }
      this.log(colors.red(`Error in swap process: ${errorMessage} ❌`));
    }
  }

  async swapWETHtoUSDC(wallet) {
    const amount = getRandomNumber(settings.AMOUNT_SWAP[0], settings.AMOUNT_SWAP[1]);
    await this._swap(wallet, CONTRACT_ADDRESSES.WETH, CONTRACT_ADDRESSES.USDC, amount, "WETH", "USDC");
  }

  async handleSwap(wallet, type = "USDC_WETH") {
    const numberSwap = settings.NUMBER_OF_SWAP;
    this.log(colors.yellow(`Starting ${numberSwap} swaps...\n`));

    for (let i = 0; i < numberSwap; i++) {
      this.log(colors.blue(`Swap ${i + 1}/${numberSwap} | Type: ${type}`));
      if (type === "USDC_WETH") {
        await this.swapUSDCtoWETH(wallet);
      } else if (type === "WETH_USDC") {
        await this.swapWETHtoUSDC(wallet);
      } else {
        this.log(colors.red(`Unknown swap type: ${type}`));
      }
      await sleep(10); // Thêm một khoảng dừng ngắn giữa các giao dịch
    }
  }
  async swapUSDCtoWETH(wallet) {
    const amount = getRandomNumber(1, 5);
    await this._swap(wallet, CONTRACT_ADDRESSES.USDC, CONTRACT_ADDRESSES.WETH, amount, "USDC", "WETH");
  }

  async executeTransfers(wallet) {
    const numberOfTransfers = settings.NUMBER_OF_TRANSFER;
    this.log(colors.yellow(`Starting ${numberOfTransfers} transfers...\n`));
    const results = [];
    for (let i = 0; i < numberOfTransfers; i++) {
      const receipt = getRandomElement(wallets);
      const amount = getRandomNumber(settings.AMOUNT_TRANSFER[0], settings.AMOUNT_TRANSFER[1]);
      if (amount === 0) continue;

      this.log(colors.blue(`Transfer ${i + 1}/${numberOfTransfers} | Amount: ${amount} ETH to ${receipt}`));
      const result = await this.sendToAddress(wallet, amount, receipt);

      if (result) {
        results.push(result);
      }

      if (i < numberOfTransfers - 1) {
        const timeSleep = getRandomNumber(settings.DELAY_BETWEEN_REQUESTS[0], settings.DELAY_BETWEEN_REQUESTS[1]);
        this.log(colors.white(`Waiting for ${timeSleep} seconds before next transfer...`));
        await sleep(timeSleep); // Chuyển đổi giây sang mili giây
      }
    }
    this.log(colors.green(`\nCompleted ${results.length}/${numberOfTransfers} transfers successfully. 🎉`));
    return results;
  }

  async handleTransfers(wallet) {
    await this.executeTransfers(wallet);
  }

  async handleWithdrawing(wallet) {
    await this.withdrawETHFromGateway(wallet);
  }

  async handleDeposit(wallet) {
    await this.depositETHToGateway(wallet);
  }

  async handleFaucet() {
    for (const syb of settings.TOKENS_FAUCET) {
      try {
        const timesleep = getRandomNumber(settings.DELAY_BETWEEN_REQUESTS[0], settings.DELAY_BETWEEN_REQUESTS[1]);
        this.log(`Starting faucet ${syb} | Delay ${timesleep}s...`, "info");
        await sleep(timesleep);
        let agent = null;
        if (this.proxy && settings.USE_PROXY) {
          agent = new HttpsProxyAgent(this.proxy);
        }
        const urlCheck = `https://faucet-api.riselabs.xyz/faucet/multi-eligibility?address=${this.itemData.address}&tokens=${syb}`;
        const headers = {
          "Content-Type": "application/json",
          origin: "https://portal.risechain.com",
          referer: "https://portal.risechain.com/",
          host: "faucet-api.riselabs.xyz",
        };
        this.log(`Cheking avaliable faucet ${syb}...`);
        const responseCheck = await axios.get(urlCheck, {
          headers: headers,
          timeout: 120000,
          ...(agent ? { httpAgent: agent, httpsAgent: agent } : {}),
        });

        if (!responseCheck.data.results[syb].eligible) {
          this.log(`Token not eligible to faucet: ${JSON.stringify(responseCheck?.data || {})}`, "error");
          continue;
        }

        this.log(`Captcha solving[1/1]...`, "info");
        const captchaToken = await solveCaptcha();
        if (!captchaToken) {
          this.log(`failed to solve captcha`, "error");
          return;
        }

        const urlStart = `https://faucet-api.riselabs.xyz/faucet/multi-request`;

        const payloadStart = {
          address: this.itemData.address,
          turnstileToken: captchaToken,
          tokens: [syb],
        };

        const responseStart = await axios.post(urlStart, payloadStart, {
          headers: headers,
          timeout: 120000,
          ...(agent ? { httpAgent: agent, httpsAgent: agent } : {}),
        });

        if (responseStart.status !== 200) {
          this.log(`Error starting faucet: ${responseStart.status} - ${JSON.stringify(responseStart?.data || {})}`, "error");
          return;
        }

        if (!responseStart.data?.results?.length > 0) return this.log(`Can't faucet`, "warning");
        for (const claimData of responseStart.data.results) {
          const { tx, amount, tokenSymbol, success, message } = claimData;
          if (success) {
            this.log(`Faucet ${parseFloat(amount).toFixed(4)} ${tokenSymbol} success | Tx: ${tx}`, "success");
          } else {
            this.log(`Faucet ${tokenSymbol} failed | Message: ${message || "Unknow"}`, "warning");
          }
        }
      } catch (error) {
        this.log(`Error in handleFaucet: ${error.message}`, "error");
      }
    }
  }

  async handleAll(wallet) {
    for (const task of settings.TASKS_ID) {
      switch (`${task}`) {
        case "1":
          await this.handleFaucet(wallet);
          continue;
        case "2":
          await this.handleTransfers(wallet);
          continue;
        case "3":
          await this.handleDeposit(wallet);
          continue;
        case "4":
          await this.handleWithdrawing(wallet);
          continue;
        case "5":
          await this.wrapETH(wallet);
          continue;
        case "6":
          await this.unWrapETH(wallet);
          continue;
        case "7":
          await this.handleSwap(wallet, "WETH_USDC");
          continue;
        case "8":
          await this.handleSwap(wallet, "USDC_WETH");
          continue;
        default:
          continue;
      }
    }
  }
  async runAccount() {
    const accountIndex = this.accountIndex;
    this.session_name = this.itemData.address;
    if (settings.USE_PROXY) {
      try {
        this.proxyIP = await this.checkProxyIP();
      } catch (error) {
        this.log(`Cannot check proxy IP: ${error.message}`, "warning");
        return;
      }
      const timesleep = getRandomNumber(settings.DELAY_START_BOT[0], settings.DELAY_START_BOT[1]);
      console.log(`=========Tài khoản ${accountIndex + 1} | ${this.proxyIP} | Bắt đầu sau ${timesleep} giây...`.green);
      await sleep(timesleep);
    }

    const { provider, wallet, proxy } = await connectToNetwork(this.proxy, this.itemData.privateKey);

    if (!provider) {
      this.log("Failed to connect to network. Exiting...", "error");
      return;
    }
    this.wallet = wallet;
    this.provider = provider;
    await this.getWalletInfo(wallet);

    switch (this.itemData.acction) {
      case "1":
        await this.handleFaucet(wallet);
        break;
      case "2":
        await this.handleTransfers(wallet);
        break;
      case "3":
        await this.handleDeposit(wallet);
        break;
      case "4":
        await this.handleWithdrawing(wallet);
        break;
      case "5":
        await this.wrapETH(wallet);
        break;
      case "6":
        await this.unWrapETH(wallet);
        break;
      case "7":
        await this.handleSwap(wallet, "WETH_USDC");
        break;
      case "8":
        await this.handleSwap(wallet, "USDC_WETH");
        break;
      case "9":
        await this.handleAll(wallet);
        break;
      default:
        process.exit(0);
    }

    // await this.getWalletInfo(wallet);
  }
}

async function runWorker(workerData) {
  const { itemData, accountIndex, proxy, hasIDAPI = null, authInfos } = workerData;
  const to = new ClientAPI(itemData, accountIndex, proxy, hasIDAPI, authInfos);
  try {
    await Promise.race([to.runAccount(), new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 24 * 60 * 60 * 1000))]);
    parentPort.postMessage({
      accountIndex,
    });
  } catch (error) {
    parentPort.postMessage({ accountIndex, error: error.message });
  } finally {
    if (!isMainThread) {
      parentPort.postMessage("taskComplete");
    }
  }
}

async function main() {
  showBanner();
  const privateKeys = loadData("privateKeys.txt");
  const proxies = loadData("proxies.txt");
  let acction = 0;
  if (privateKeys.length == 0 || (privateKeys.length > proxies.length && settings.USE_PROXY)) {
    console.log("Số lượng proxy và data phải bằng nhau.".red);
    console.log(`Data: ${privateKeys.length}`);
    console.log(`Proxy: ${proxies.length}`);
    process.exit(1);
  }
  if (!settings.USE_PROXY) {
    console.log(`You are running bot without proxies!!!`.yellow);
  }
  let maxThreads = settings.USE_PROXY ? settings.MAX_THEADS : settings.MAX_THEADS_NO_PROXY;
  const titles = [
    "Faucet",
    "Share ETH to wallets.txt",
    "Deposit ETH to Gateway (Inari Finance)",
    "Withdraw WETH from Gateway (Inari Finance)",
    "Wrap ETH => WETH (GasPump)",
    "Unwrap WETH => ETH (GasPump)",
    "Swap WETH to USDC (GasPump)",
    "Swap USDC to WETH (GasPump)",
    "Auto All Task ID (setting in .env: TASKS_ID",
  ];
  titles.map((val, index) => console.log(colors.white(`[${index + 1}] ${val}`)));
  console.log(colors.white("===================="));

  acction = await askQuest(`Choose an option (1-${titles.length}): `);
  if (acction < 1 || acction > titles.length) {
    console.log(colors.red("Invalid option. Please try again. ⚠️"));
    await sleep(1);
    process.exit(0);
  }

  const data = privateKeys.map((val, index) => {
    const prvk = val.startsWith("0x") ? val : `0x${val}`;
    const wallet = new ethers.Wallet(prvk);
    const item = {
      address: wallet.address,
      privateKey: prvk,
      index,
      acction,
    };
    return item;
  });

  await sleep(1);
  while (true) {
    let currentIndex = 0;
    const errors = [];
    while (currentIndex < data.length) {
      const workerPromises = [];
      const batchSize = Math.min(maxThreads, data.length - currentIndex);
      for (let i = 0; i < batchSize; i++) {
        const worker = new Worker(__filename, {
          workerData: {
            hasIDAPI: null,
            itemData: data[currentIndex],
            accountIndex: currentIndex,
            proxy: proxies[currentIndex % proxies.length],
            authInfos: {},
          },
        });

        workerPromises.push(
          new Promise((resolve) => {
            worker.on("message", (message) => {
              if (message === "taskComplete") {
                worker.terminate();
              }
              if (settings.ENABLE_DEBUG) {
                console.log(message);
              }
              resolve();
            });
            worker.on("error", (error) => {
              console.log(`Lỗi worker cho tài khoản ${currentIndex}: ${error?.message}`);
              worker.terminate();
              resolve();
            });
            worker.on("exit", (code) => {
              worker.terminate();
              if (code !== 0) {
                errors.push(`Worker cho tài khoản ${currentIndex} thoát với mã: ${code}`);
              }
              resolve();
            });
          })
        );

        currentIndex++;
      }

      await Promise.all(workerPromises);

      if (errors.length > 0) {
        errors.length = 0;
      }

      if (currentIndex < data.length) {
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
    }

    await sleep(3);
    console.log(`=============${new Date().toLocaleString()} | Hoàn thành tất cả tài khoản`.magenta);
    showBanner();
    await sleep(1);
    process.exit(0);
  }
}

if (isMainThread) {
  main().catch((error) => {
    console.log("Lỗi rồi:", error);
    process.exit(1);
  });
} else {
  runWorker(workerData);
}
