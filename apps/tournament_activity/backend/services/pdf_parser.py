#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
PDF解析サービス

Claude APIを使用して大会要項PDFから情報を抽出
"""

import os
import base64
import json
from typing import Dict, Any
import anthropic


class PDFParserService:
    """PDF解析サービス（Claude API使用）"""

    def __init__(self):
        """初期化"""
        self.api_key = os.getenv("ANTHROPIC_API_KEY")

        if not self.api_key:
            raise ValueError("ANTHROPIC_API_KEY is not set")

        self.client = anthropic.Anthropic(api_key=self.api_key)

    async def parse_tournament_pdf(self, pdf_content: bytes) -> Dict[str, Any]:
        """
        PDFから大会情報を抽出

        Args:
            pdf_content: PDFファイルのバイナリ内容

        Returns:
            抽出された大会情報
        """
        # PDFをbase64エンコード
        pdf_base64 = base64.standard_b64encode(pdf_content).decode('utf-8')

        # Claudeに直接PDFを送信して構造化データを取得
        message = self.client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=2048,
            messages=[{
                "role": "user",
                "content": [
                    {
                        "type": "document",
                        "source": {
                            "type": "base64",
                            "media_type": "application/pdf",
                            "data": pdf_base64
                        }
                    },
                    {
                        "type": "text",
                        "text": """このPDFは大会要項です。以下の情報を抽出してJSON形式で返してください。

必須フィールド:
{
  "tournament_id": "大会名と日付からMD5ハッシュで自動生成（例: tournament_a1b2c3d4）",
  "tournament_name": "大会名（完全な名称）",
  "registrated_ward": 主催区（北区=17, 荒川区=18, 江戸川区=23、該当なしまたは不明=0）,
  "deadline_date": "申込締切日（YYYY-MM-DD形式、例: 2024-03-15）",
  "tournament_date": "大会開催日（YYYY-MM-DD形式、例: 2024-03-20）",
  "classification": 競技形式（個人戦=0, 団体戦=1）,
  "mix_flg": ミックスダブルスか（true/false）,
  "type": ["一般", "45", "55", "60", "65", "70"]  // 該当する年齢種別の配列
}

重要な注意事項:
1. 日付は必ずYYYY-MM-DD形式に変換してください（和暦の場合は西暦に変換）
2. tournament_idは大会名と日付からMD5ハッシュ8文字で生成し、"tournament_"プレフィックスを付けてください
3. 情報が見つからない場合は適切なデフォルト値を使用してください
4. JSONのみを返し、説明文やマークダウンは不要です

JSON:"""
                    }
                ]
            }]
        )

        # レスポンスからJSONを抽出
        response_text = message.content[0].text.strip()

        # マークダウンコードブロックを削除（もしあれば）
        if response_text.startswith('```'):
            response_text = response_text.split('```')[1]
            if response_text.startswith('json'):
                response_text = response_text[4:]
            response_text = response_text.strip()

        # JSONをパース
        tournament_data = json.loads(response_text)

        # tournament_idの生成（Claudeが生成していない場合）
        if not tournament_data.get("tournament_id") or tournament_data["tournament_id"] == "":
            import hashlib
            id_source = f"{tournament_data.get('tournament_name', 'unknown')}_{tournament_data.get('tournament_date', '')}"
            hash_value = hashlib.md5(id_source.encode()).hexdigest()[:8]
            tournament_data["tournament_id"] = f"tournament_{hash_value}"

        return tournament_data
