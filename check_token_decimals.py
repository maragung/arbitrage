#!/usr/bin/env python3
"""
Script untuk memeriksa desimal token di jaringan Avalanche
"""
import json
import requests
from web3 import Web3

# Konfigurasi RPC Avalanche
RPC_URL = "https://api.avax.network/ext/bc/C/rpc"

w3 = Web3(Web3.HTTPProvider(RPC_URL))

# Daftar token dengan alamat dan nama
tokens = {
    "USDT": "0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7",
    "USDC": "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E",
    "BTC.b": "0x152b9d0FdC40C096757F570A51E494bd4b943E50",
    "sAVAX": "0x2b2C81e08f1Af8835a78Bb2A90AE924ACE0eA4bE",
    "WAVAX": "0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7",
    "WETH.e": "0x49D5c2BdFfac6CE2BFdB6640F4F80f226bc10bAB",
    "USDC.e": "0xA7D7079b0FEaD91F3e65f86E8915Cb59c1a4C664",
    "WBTC.e": "0x50b7545627a5162F82A992c33b87aDc75187B218",
    "stAVAX": "0xA25EaF2906FA1a3a13EdAc9B9657108Af7B703e3",
    "JOE": "0x6e84a6216eA6dACC71eE8E6b0a5B7322EEbC0fDd",
    "USDT.e": "0xc7198437980c041c805A1EDcbA50c1Ce5db95118",
    "WXT": "0xfcDe4A87b8b6FA58326BB462882f1778158B02F1",
    "QI": "0x8729438EB15e2C8B576fCc6AeCdA6A148776C0F5",
    "PNG": "0x60781C2586D68229fde47564546784ab3fACA982",
    "XAVA": "0xd1c3f94DE7e5B45fa4eDBBA472491a9f4B166FC4",
    "ARENA": "0xB8d7710f7d8349A506b75dD184F05777c82dAd0C",
    "GUNZ": "0x26deBD39D5eD069770406FCa10A0E4f8d2c743eB",
    "COQ": "0x420FcA0121DC28039145009570975747295f2329",
    "ALOT": "0x093783055F9047C2BfF99c4e414501F8A147bC69",
    "BLACK": "0xcd94a87696FAC69Edae3a70fE5725307Ae1c43f6",
    "LINK.e": "0x5947BB275c521040051D82396192181b413227A3",
    "XAUT0": "0x2775d5105276781B4b85bA6eA6a6653bEeD1dd32"
}

def get_token_decimals(token_address):
    """Mendapatkan jumlah desimal dari kontrak token"""
    # ABI fungsi decimals() standar ERC20
    erc20_decimals_abi = [
        {
            "constant": True,
            "inputs": [],
            "name": "decimals",
            "outputs": [{"name": "", "type": "uint8"}],
            "payable": False,
            "stateMutability": "view",
            "type": "function"
        }
    ]
    
    contract = w3.eth.contract(address=Web3.to_checksum_address(token_address), abi=erc20_decimals_abi)
    try:
        decimals = contract.functions.decimals().call()
        return decimals
    except Exception as e:
        print(f"Error getting decimals for {token_address}: {e}")
        return None

def main():
    print("Memeriksa desimal token...")
    print("=" * 60)
    
    token_info = {}
    for symbol, address in tokens.items():
        decimals = get_token_decimals(address)
        token_info[symbol] = {
            "address": address,
            "decimals": decimals
        }
        print(f"{symbol}: {address} - Decimals: {decimals}")
    
    print("\n" + "=" * 60)
    print("Hasil dalam format untuk tokenlist:")
    print("=" * 60)
    
    for symbol, info in token_info.items():
        status = "OK" if info['decimals'] is not None else "ERROR"
        print(f"{symbol} {info['address']} - Desimal: {info['decimals']} [{status}]")
    
    # Simpan hasil ke file JSON
    with open('tokenlist_with_decimals.json', 'w') as f:
        json.dump(token_info, f, indent=2)
    
    print(f"\nHasil juga disimpan ke tokenlist_with_decimals.json")

if __name__ == "__main__":
    main()