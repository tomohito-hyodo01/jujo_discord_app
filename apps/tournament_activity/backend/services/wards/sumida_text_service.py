"""
墨田区専用 テキスト申込書サービス

墨田区の団体戦は、申込書をテキストで送付する運用のため、
Excelではなくテキストを生成する。

出力仕様（申込1件＝1チーム）:
    チーム名: 十条クラブ（固定）
    各選手:
        - 氏名
        - 所属クラブ名: 十条クラブ（固定）
        - 生年月日
        - 電話番号
"""
from datetime import datetime, date
from typing import List, Dict, Optional


class SumidaTextService:
    """墨田区専用のテキスト申込書生成サービス"""

    ward_id = 7
    ward_name = "墨田区"

    # チーム名・所属クラブ名は固定
    FIXED_TEAM_NAME = "十条クラブ"
    FIXED_CLUB_NAME = "十条クラブ"

    def _format_birth_date(self, birth_date) -> str:
        """生年月日を YYYY/MM/DD 形式に整形"""
        if not birth_date:
            return ""
        if isinstance(birth_date, str):
            try:
                birth_date = datetime.strptime(birth_date[:10], "%Y-%m-%d").date()
            except ValueError:
                return birth_date
        if isinstance(birth_date, (datetime, date)):
            return f"{birth_date.year}/{birth_date.month:02d}/{birth_date.day:02d}"
        return str(birth_date)

    def _format_type_sex(self, type_: Optional[str], sex: Optional[int]) -> str:
        """種別と性別を結合（例: 一般男子）"""
        if type_ is None:
            return ""
        if sex is None:
            return str(type_)
        sex_str = "男子" if sex == 0 else "女子"
        return f"{type_}{sex_str}"

    def build_team_text(self, tournament: Dict, registration: Dict) -> str:
        """
        申込1件（=1チーム）分のテキストを生成

        Args:
            tournament: 大会情報（tournament_mst）
            registration: 申込情報。'members' に選手dictのリストを含むこと。
                各選手dict: player_name / birth_date / phone_number など

        Returns:
            送付用テキスト
        """
        tournament_name = tournament.get("tournament_name", "")
        type_sex = self._format_type_sex(registration.get("type"), registration.get("sex"))

        lines: List[str] = []
        header = f"【墨田区 団体戦申込】{tournament_name}".rstrip()
        if type_sex:
            header += f"（{type_sex}【団体】）"
        lines.append(header)
        lines.append(f"チーム名：{self.FIXED_TEAM_NAME}")
        lines.append("")

        members = registration.get("members", [])
        for idx, player in enumerate(members, start=1):
            if player is None:
                continue
            lines.append(f"{idx}）氏名：{player.get('player_name', '')}")
            lines.append(f"　所属クラブ名：{self.FIXED_CLUB_NAME}")
            lines.append(f"　生年月日：{self._format_birth_date(player.get('birth_date'))}")
            lines.append(f"　電話番号：{player.get('phone_number', '')}")
            lines.append("")

        return "\n".join(lines).rstrip()

    def build_texts(self, tournament: Dict, registrations: List[Dict]) -> List[str]:
        """
        全申込分のテキストブロックをリストで生成（1チーム1ブロック）

        Args:
            tournament: 大会情報
            registrations: 'members' を含む申込データのリスト

        Returns:
            チームごとのテキストのリスト
        """
        texts: List[str] = []
        for reg in registrations:
            text = self.build_team_text(tournament, reg)
            if text:
                texts.append(text)
        return texts
