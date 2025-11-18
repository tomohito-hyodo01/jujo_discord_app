#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
PDF解析サービス

Azure Document Intelligenceを使用して大会要項PDFから情報を抽出
"""

import os
import re
from typing import Dict, Any
from azure.ai.formrecognizer import DocumentAnalysisClient
from azure.core.credentials import AzureKeyCredential


class PDFParserService:
    """PDF解析サービス"""

    def __init__(self):
        """初期化"""
        self.endpoint = os.getenv("AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT")
        self.api_key = os.getenv("AZURE_DOCUMENT_INTELLIGENCE_KEY")

        if not self.endpoint or not self.api_key:
            raise ValueError("Azure Document Intelligence credentials not set")

        self.client = DocumentAnalysisClient(
            endpoint=self.endpoint,
            credential=AzureKeyCredential(self.api_key)
        )

    async def parse_tournament_pdf(self, pdf_content: bytes) -> Dict[str, Any]:
        """
        PDFから大会情報を抽出

        Args:
            pdf_content: PDFファイルのバイナリ内容

        Returns:
            抽出された大会情報
        """
        # Azure Document Intelligenceで解析
        poller = self.client.begin_analyze_document(
            "prebuilt-layout", pdf_content
        )
        result = poller.result()

        # テキストを抽出
        text = ""
        for page in result.pages:
            for line in page.lines:
                text += line.content + "\n"

        # テキストから大会情報を抽出
        tournament_data = self._extract_tournament_info(text)

        return tournament_data

    def _extract_tournament_info(self, text: str) -> Dict[str, Any]:
        """
        抽出したテキストから大会情報をパース

        Args:
            text: 抽出されたテキスト

        Returns:
            大会情報の辞書
        """
        data = {
            "tournament_id": "",
            "tournament_name": "",
            "registrated_ward": 0,
            "deadline_date": "",
            "tournament_date": "",
            "classification": 0,
            "mix_flg": False,
            "type": []
        }

        # 大会名を抽出（「大会」「選手権」「大会」などを含む行）
        name_patterns = [
            r"(.+(?:大会|選手権|トーナメント|オープン))",
            r"大会名[：:]\s*(.+)",
        ]
        for pattern in name_patterns:
            match = re.search(pattern, text)
            if match:
                data["tournament_name"] = match.group(1).strip()
                break

        # 日付を抽出（YYYY年MM月DD日 または YYYY/MM/DD など）
        date_patterns = [
            r"(\d{4})[年/\-](\d{1,2})[月/\-](\d{1,2})",
            r"大会日[：:]\s*(\d{4})[年/\-](\d{1,2})[月/\-](\d{1,2})",
        ]
        for pattern in date_patterns:
            match = re.search(pattern, text)
            if match:
                year, month, day = match.groups()
                data["tournament_date"] = f"{year}-{month.zfill(2)}-{day.zfill(2)}"
                break

        # 締切日を抽出
        deadline_patterns = [
            r"締[め切]*[日期][：:]\s*(\d{4})[年/\-](\d{1,2})[月/\-](\d{1,2})",
            r"申込締切[：:]\s*(\d{4})[年/\-](\d{1,2})[月/\-](\d{1,2})",
        ]
        for pattern in deadline_patterns:
            match = re.search(pattern, text)
            if match:
                year, month, day = match.groups()
                data["deadline_date"] = f"{year}-{month.zfill(2)}-{day.zfill(2)}"
                break

        # 種別を抽出（一般、45、55など）
        type_patterns = [
            r"一般",
            r"45",
            r"55",
            r"60",
            r"65",
            r"70",
        ]
        types = []
        for pattern in type_patterns:
            if re.search(pattern, text):
                types.append(pattern)
        data["type"] = types if types else ["一般"]

        # ミックスフラグ
        if re.search(r"ミックス|MIX|mix", text, re.IGNORECASE):
            data["mix_flg"] = True

        # 個人戦/団体戦を判定
        if re.search(r"団体", text):
            data["classification"] = 1
        else:
            data["classification"] = 0

        # 区を抽出（江戸川区、北区など）
        ward_mapping = {
            "北区": 17,
            "荒川区": 18,
            "江戸川区": 23,
        }
        for ward_name, ward_id in ward_mapping.items():
            if ward_name in text:
                data["registrated_ward"] = ward_id
                break

        # tournament_idを生成（大会名と日付から）
        if data["tournament_name"] and data["tournament_date"]:
            # 日本語を削除してIDを生成
            import hashlib
            id_source = f"{data['tournament_name']}_{data['tournament_date']}"
            hash_value = hashlib.md5(id_source.encode()).hexdigest()[:8]
            data["tournament_id"] = f"tournament_{hash_value}"

        return data
