import type { ChatProvider } from "../providers/types";
import type { DocumentPacket } from "./context-builder";

const EVIDENCE_SELECTION_PROMPT = `You select evidence packets for a RAG answer.

Return strict JSON in the form {"indices":[1,2,3]}.
Rules:
1. Only keep packets that directly help answer the question.
2. Prefer fewer packets when they cover the answer.
3. Keep image packets when the question asks about diagrams, figures, screenshots, charts, visuals, or image evidence.
4. Never invent packet indices.
5. Return at least one index when there is any relevant packet.`;
const MAX_EVIDENCE_PACKETS = 8;
const MAX_PACKET_PREVIEW_CHARS = 400;

export class EvidenceSelector {
	private chatProvider: ChatProvider;

	constructor(chatProvider: ChatProvider) {
		this.chatProvider = chatProvider;
	}

	async select(
		question: string,
		packets: DocumentPacket[]
	): Promise<DocumentPacket[]> {
		if (packets.length <= 1) {
			return packets;
		}
		const candidatePackets = packets.slice(0, MAX_EVIDENCE_PACKETS);

		try {
			const response = await this.chatProvider.chat({
				messages: [
					{ role: "system", content: EVIDENCE_SELECTION_PROMPT },
					{
						role: "user",
						content: [
							{
								type: "text",
								text: buildSelectionPrompt(
									question,
									candidatePackets
								),
							},
						],
					},
				],
			});

			const selectedIndices = parseEvidenceSelection(response.content);
			if (selectedIndices.length === 0) {
				return candidatePackets;
			}

			const selectedPackets = selectedIndices
				.map((index) => candidatePackets[index - 1])
				.filter((packet): packet is DocumentPacket => Boolean(packet));

			return selectedPackets.length > 0
				? selectedPackets
				: candidatePackets;
		} catch {
			return candidatePackets;
		}
	}
}

function buildSelectionPrompt(
	question: string,
	packets: DocumentPacket[]
): string {
	const packetText = packets
		.map((packet, index) => {
			const preview =
				packet.content.length > MAX_PACKET_PREVIEW_CHARS
					? `${packet.content.slice(0, MAX_PACKET_PREVIEW_CHARS)}…`
					: packet.content;
			return [
				`[${index + 1}] ${packet.type.toUpperCase()} ${packet.path}`,
				packet.headingPath ? `Heading: ${packet.headingPath}` : "",
				preview,
			]
				.filter(Boolean)
				.join("\n");
		})
		.join("\n\n===\n\n");

	return `Question:\n${question}\n\nCandidate packets:\n${packetText}`;
}

function parseEvidenceSelection(content: string): number[] {
	const jsonMatch = content.match(/\{[\s\S]*\}/);
	if (!jsonMatch) {
		return [];
	}

	try {
		const parsed = JSON.parse(jsonMatch[0]) as { indices?: unknown };
		if (!Array.isArray(parsed.indices)) {
			return [];
		}

		return parsed.indices
			.map((value) => Number(value))
			.filter((value) => Number.isInteger(value) && value > 0);
	} catch {
		return [];
	}
}
